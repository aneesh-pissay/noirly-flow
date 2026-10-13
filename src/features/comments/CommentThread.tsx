"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Comment, CommentMention } from "@/src/core/sync/types";
import { memberName, type WorkspaceMember } from "@/src/features/workspace/members";

import { moveMentions } from "./mentions";

type Props = {
  taskId: string;
  workspaceId: string;
  members: WorkspaceMember[];
  canWrite?: boolean;
};

export function CommentThread({
  taskId,
  members,
  canWrite = true,
}: Props) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mentions, setMentions] = useState<CommentMention[]>([]);
  const [caret, setCaret] = useState(0);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const match = body.slice(0, caret).match(/(?:^|\s)@([^@\n]{0,80})$/);
  const mentionStart = match ? caret - match[1].length - 1 : -1;
  const query = match?.[1].toLocaleLowerCase() ?? "";
  const suggestions = members.filter((member) =>
    `${member.displayName} ${member.email}`.toLocaleLowerCase().includes(query),
  );
  const showSuggestions = suggestionsOpen && Boolean(match) && mentions.length < 50 && !mentions.some((mention) => mention.start === mentionStart);
  const activeIndex = Math.min(active, Math.max(0, suggestions.length - 1));
  useEffect(() => {
    if (showSuggestions) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [showSuggestions, listId, activeIndex]);

  function selectMember(member: WorkspaceMember) {
    const token = `@${member.displayName.replace(/[\r\n]/g, " ").trim() || member.email}`;
    const next = body.slice(0, mentionStart) + token + " " + body.slice(caret);
    if (next.length > 8000) return;
    const kept = moveMentions(body, next, mentions);
    setMentions([...kept, { userId: member.userId, start: mentionStart, end: mentionStart + token.length }].sort((a, b) => a.start - b.start));
    setBody(next);
    const position = mentionStart + token.length + 1;
    setCaret(position);
    setSuggestionsOpen(false);
    requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(position, position); });
  }

  function renderComment(comment: Comment) {
    const parts: ReactNode[] = [];
    let offset = 0;
    for (const mention of [...(comment.mentions ?? [])].sort((a, b) => a.start - b.start)) {
      if (mention.start < offset || mention.end > comment.body.length || mention.end <= mention.start) continue;
      parts.push(comment.body.slice(offset, mention.start));
      parts.push(<span key={`${mention.start}-${mention.userId}`} title={memberName(members, mention.userId)} className="rounded bg-[var(--accent-soft)] px-1 font-medium text-[var(--accent)]">{comment.body.slice(mention.start, mention.end)}</span>);
      offset = mention.end;
    }
    parts.push(comment.body.slice(offset));
    return parts;
  }

  const commentsQuery = useQuery({
    queryKey: qk.comments(taskId),
    queryFn: () => api.listComments(taskId),
  });

  const createMutation = useMutation({
    mutationFn: (input: { text: string; mentions: CommentMention[] }) => api.createComment(taskId, input.text, input.mentions),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: qk.comments(taskId) });
      const previous = queryClient.getQueryData<{ comments: Comment[] }>(
        qk.comments(taskId),
      );
      const now = new Date().toISOString();
      const optimistic = {
        id: `tmp-${crypto.randomUUID()}`,
        taskId,
        authorId: "",
        body: input.text,
        mentions: input.mentions,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      queryClient.setQueryData(qk.comments(taskId), {
        comments: [...(previous?.comments ?? []), optimistic],
      });
      setNotice("");
      setError(null);
      return { previous, optimisticId: optimistic.id };
    },
    onSuccess: (data, input, context) => {
      setBody("");
      setMentions([]);
      setCaret(0);
      setSuggestionsOpen(false);
      setNotice(input.mentions.length ? "Comment posted. Email notifications queued for tagged teammates." : "Comment posted.");
      queryClient.setQueryData<{ comments: Comment[] }>(
        qk.comments(taskId),
        (old) => {
          if (!old) return { comments: [data.comment] };
          return {
            comments: old.comments.map((comment) =>
              comment.id === context?.optimisticId ? data.comment : comment,
            ),
          };
        },
      );
    },
    onError: (err: Error, _text, context) => {
      queryClient.setQueryData(qk.comments(taskId), context?.previous ?? { comments: [] });
      setError(err.message);
    },
  });

  const comments = commentsQuery.data?.comments ?? [];

  return (
    <section>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Comments
      </p>
      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id} id={`comment-${comment.id}`} className="border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-medium text-[var(--foreground)]">
                {memberName(members, comment.authorId)}
              </p>
              <time
                dateTime={comment.createdAt}
                className="font-mono text-[10px] text-[var(--muted-foreground)]"
              >
                {new Date(comment.createdAt).toLocaleString()}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted-foreground)]">
              {renderComment(comment)}
            </p>
          </li>
        ))}
        {commentsQuery.isLoading ? (
          <li className="text-xs text-[var(--muted-foreground)]">Loading comments…</li>
        ) : comments.length === 0 ? (
          <li className="text-xs text-[var(--muted-foreground)]">No comments yet.</li>
        ) : null}
      </ul>
      {canWrite ? (
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!body.trim() || createMutation.isPending) return;
          const leading = body.length - body.trimStart().length;
          const text = body.trim();
          createMutation.mutate({ text, mentions: mentions.map((mention) => ({ ...mention, start: mention.start - leading, end: mention.end - leading })).filter((mention) => mention.start >= 0 && mention.end <= text.length) });
        }}
      >
        <label htmlFor={`${listId}-input`} className="text-xs text-[var(--muted-foreground)]">Comment · type @ to tag members</label>
        <textarea
          ref={textarea} id={`${listId}-input`} value={body} maxLength={8000}
          disabled={createMutation.isPending}
          role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
          aria-expanded={showSuggestions} aria-controls={showSuggestions ? listId : undefined}
          aria-activedescendant={showSuggestions && suggestions.length ? `${listId}-${activeIndex}` : undefined}
          onChange={(event) => {
            const next = event.target.value;
            setMentions(moveMentions(body, next, mentions)); setBody(next);
            setCaret(event.target.selectionStart); setActive(0); setSuggestionsOpen(true); setNotice("");
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onFocus={() => setSuggestionsOpen(true)} onBlur={() => setSuggestionsOpen(false)}
          onKeyDown={(event) => {
            if (!showSuggestions || event.nativeEvent.isComposing) return;
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSuggestionsOpen(false); }
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) {
              event.preventDefault(); setActive((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
            }
            if (event.key === "Enter" && !event.shiftKey && suggestions[activeIndex]) {
              event.preventDefault(); selectMember(suggestions[activeIndex]);
            }
          }}
          placeholder="Write a comment…" rows={3}
          className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-50"
        />
        {showSuggestions ? <ul id={listId} role="listbox" aria-label="Workspace members" data-lenis-prevent className="max-h-52 overflow-y-auto rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-1">
          {suggestions.map((member, index) => <li key={member.userId} id={`${listId}-${index}`} role="option" aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()} onClick={() => selectMember(member)}
            className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${index === activeIndex ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--foreground)]"}`}>
            <span className="block font-medium">{member.displayName}</span><span className="block text-xs text-[var(--muted-foreground)]">{member.email}</span>
          </li>)}
          {!suggestions.length ? <li role="presentation" className="px-3 py-2 text-sm text-[var(--muted-foreground)]">No matching members.</li> : null}
        </ul> : null}
        {mentions.length ? <p className="text-xs text-[var(--muted-foreground)]">Tagged: {[...new Set(mentions.map((mention) => memberName(members, mention.userId)))].join(", ")}. Teammates will be notified by email.</p> : null}
        <p role="status" className="text-xs text-[var(--muted-foreground)]">{notice}</p>
        <div className="flex items-center justify-between">
          {error ? (
            <p className="text-xs text-[var(--foreground)]" role="alert">
              {error}
            </p>
          ) : (
            <span />
          )}
          <Button type="submit" size="sm" disabled={!body.trim() || createMutation.isPending}>
            {createMutation.isPending ? "Posting…" : "Comment"}
          </Button>
        </div>
      </form>
      ) : null}
    </section>
  );
}
