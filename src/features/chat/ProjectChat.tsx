"use client";

import { useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RealtimeClientContext } from "@noirly-dev/realtime-client/react";
import { Button } from "@noirly-dev/ui";
import { Trash2 } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { ChatMessage } from "@/src/core/sync/types";
import { initials, memberName } from "@/src/features/workspace/members";
import { useCan, useWorkspaceRole } from "@/src/features/workspace/WorkspaceRoleContext";
import { ProjectRealtime } from "@/src/features/realtime/ProjectRealtime";

type Page = { messages: ChatMessage[]; hasMore: boolean };
type ChatCache = { pages: Page[]; pageParams: unknown[] };

const noSubscribe = () => () => {};

/** Poll briskly until the socket is up; once it is, events drive refreshes. */
function useChatRefetchInterval(): number {
  const client = useContext(RealtimeClientContext);
  const status = useSyncExternalStore(
    client ? (notify) => client.onStatus(notify) : noSubscribe,
    () => client?.getStatus() ?? "idle",
    () => "idle",
  );
  return status === "ready" ? 60_000 : 4_000;
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date);
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function ProjectChat({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const queryClient = useQueryClient();
  const canPost = useCan("task.write");
  const role = useWorkspaceRole();
  const canModerate = role === "admin" || role === "owner";
  const refetchInterval = useChatRefetchInterval();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const restoreFrom = useRef<number | null>(null);

  const workspaceQuery = useQuery({
    queryKey: qk.workspace(workspaceId),
    queryFn: () => api.getWorkspace(workspaceId),
    staleTime: 60_000,
  });
  const membersQuery = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => api.listMembers(workspaceId),
    staleTime: 60_000,
  });
  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 60_000 });
  const projectName =
    workspaceQuery.data?.projects.find((p) => p.id === projectId)?.name ?? "Project";

  const chatQuery = useInfiniteQuery({
    queryKey: qk.chat(projectId),
    queryFn: ({ pageParam }) => api.listChatMessages(projectId, pageParam),
    initialPageParam: undefined as string | undefined,
    // Pages run newest → oldest; the next one starts before this page's first message.
    getNextPageParam: (last: Page) => (last.hasMore ? last.messages[0]?.id : undefined),
    refetchInterval,
    refetchIntervalInBackground: false,
  });

  const messages = (chatQuery.data?.pages ?? [])
    .slice()
    .reverse()
    .flatMap((page) => page.messages);
  const members = membersQuery.data?.members ?? [];
  const myId = meQuery.data?.user.id;
  const lastId = messages.at(-1)?.id;

  // Follow new messages only when already at the bottom, so reading history
  // isn't yanked away; after loading older ones, keep the reader's place.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (restoreFrom.current !== null) {
      el.scrollTop = el.scrollHeight - restoreFrom.current;
      restoreFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastId, messages.length]);

  useEffect(() => {
    stickToBottom.current = true;
  }, [projectId]);

  const sendMutation = useMutation({
    mutationFn: (body: string) => api.sendChatMessage(projectId, body),
    onSuccess: ({ message }) => {
      stickToBottom.current = true;
      queryClient.setQueryData<ChatCache>(qk.chat(projectId), (old) => {
        if (!old?.pages.length) return old;
        const [newest, ...rest] = old.pages;
        if (newest!.messages.some((m) => m.id === message.id)) return old;
        return { ...old, pages: [{ ...newest!, messages: [...newest!.messages, message] }, ...rest] };
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) => api.deleteChatMessage(projectId, messageId),
    onSuccess: (_result, messageId) => {
      queryClient.setQueryData<ChatCache>(qk.chat(projectId), (old) =>
        old
          ? {
              ...old,
              pages: old.pages.map((p) => ({ ...p, messages: p.messages.filter((m) => m.id !== messageId) })),
            }
          : old,
      );
    },
  });

  function send() {
    const body = draft.trim();
    if (!body || sendMutation.isPending) return;
    setDraft("");
    // Put the text back if it didn't go through, so nothing typed is lost.
    sendMutation.mutate(body, { onError: () => setDraft(body) });
  }

  const actionError = sendMutation.error ?? deleteMutation.error;

  return (
    <div className="flex h-full min-h-[28rem] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
            {projectName}
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">Chat</h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Everyone in this workspace can read it{canPost ? "" : " · view only"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {process.env.NEXT_PUBLIC_REALTIME_WS_URL ? (
            <ProjectRealtime workspaceId={workspaceId} projectId={projectId} />
          ) : null}
          <Link
            href={`/w/${workspaceId}/p/${projectId}`}
            className="rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          >
            Tasks
          </Link>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)]">
        <div
          ref={listRef}
          role="log"
          aria-label={`${projectName} chat`}
          onScroll={(event) => {
            const el = event.currentTarget;
            stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        >
          {chatQuery.hasNextPage ? (
            <div className="mb-4 flex justify-center">
              <button
                type="button"
                disabled={chatQuery.isFetchingNextPage}
                onClick={() => {
                  const el = listRef.current;
                  restoreFrom.current = el ? el.scrollHeight - el.scrollTop : null;
                  void chatQuery.fetchNextPage();
                }}
                className="cursor-pointer rounded-full border border-[var(--hairline)] px-3 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                {chatQuery.isFetchingNextPage ? "Loading…" : "Load earlier messages"}
              </button>
            </div>
          ) : null}

          {chatQuery.isPending ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading messages…</p>
          ) : chatQuery.isError ? (
            <p className="text-sm text-[var(--foreground)]">
              Could not load the chat.{" "}
              <button type="button" onClick={() => void chatQuery.refetch()} className="underline">
                Try again
              </button>
            </p>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm text-[var(--foreground)]">No messages yet</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Start the conversation about {projectName}.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col">
              {messages.map((message, index) => {
                const prev = messages[index - 1];
                const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(message.createdAt);
                // Consecutive messages from one person within 5 minutes share a header.
                const grouped =
                  !newDay &&
                  prev?.authorId === message.authorId &&
                  Date.parse(message.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
                const mine = message.authorId === myId;
                const name = mine ? "You" : memberName(members, message.authorId);
                return (
                  <li key={message.id}>
                    {newDay ? (
                      <div className="my-3 flex items-center gap-3" aria-hidden>
                        <span className="h-px flex-1 bg-[var(--hairline)]" />
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                          {dayLabel(message.createdAt)}
                        </span>
                        <span className="h-px flex-1 bg-[var(--hairline)]" />
                      </div>
                    ) : null}
                    <div
                      className={`group flex gap-3 rounded-lg px-2 py-1 hover:bg-[var(--surface-2)] ${grouped ? "" : "mt-2"}`}
                    >
                      <div className="w-8 shrink-0">
                        {grouped ? null : (
                          <span
                            aria-hidden
                            className={`flex size-8 items-center justify-center rounded-full font-mono text-[11px] ${
                              mine
                                ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                                : "bg-[var(--accent-soft)] text-[var(--accent)]"
                            }`}
                          >
                            {initials(memberName(members, message.authorId))}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        {grouped ? (
                          <span className="sr-only">{name}: </span>
                        ) : (
                          <p className="flex items-baseline gap-2">
                            <span className="text-sm font-medium text-[var(--foreground)]">{name}</span>
                            <time
                              dateTime={message.createdAt}
                              className="text-[11px] text-[var(--muted-foreground)]"
                            >
                              {timeLabel(message.createdAt)}
                            </time>
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-sm text-[var(--foreground)]">
                          {message.body}
                        </p>
                      </div>
                      {mine || canModerate ? (
                        <button
                          type="button"
                          aria-label="Delete message"
                          title="Delete message"
                          onClick={() => deleteMutation.mutate(message.id)}
                          className="self-start rounded-md p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:text-red-400 [@media(hover:none)]:opacity-100"
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {canPost ? (
          <form
            className="flex items-end gap-2 border-t border-[var(--hairline)] p-3"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <textarea
              value={draft}
              rows={1}
              maxLength={4000}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter is a new line. Leave IME composition alone.
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={`Message ${projectName}`}
              aria-label="Message"
              className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none [field-sizing:content] placeholder:text-[var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            />
            <Button type="submit" disabled={!draft.trim() || sendMutation.isPending}>
              Send
            </Button>
          </form>
        ) : (
          <p className="border-t border-[var(--hairline)] p-3 text-xs text-[var(--muted-foreground)]">
            Viewers can read the chat but not post.
          </p>
        )}
        {actionError ? (
          <p className="px-3 pb-3 text-xs text-[var(--foreground)]">{actionError.message}</p>
        ) : null}
      </section>
    </div>
  );
}
