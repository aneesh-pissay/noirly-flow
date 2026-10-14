"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Comment, CommentMention } from "@/src/core/sync/types";
import { memberName, type WorkspaceMember } from "@/src/features/workspace/members";
import { useWorkspaceRole } from "@/src/features/workspace/WorkspaceRoleContext";

import { moveMentions } from "./mentions";

type Props = {
  taskId: string;
  workspaceId: string;
  members: WorkspaceMember[];
  canWrite?: boolean;
};

type CommentsCache = { comments: Comment[] };

export function CommentThread({
  taskId,
  workspaceId,
  members,
  canWrite = true,
}: Props) {
  const queryClient = useQueryClient();
  const role = useWorkspaceRole();
  const canModerate = role === "admin" || role === "owner";
  const meQuery = useQuery({ queryKey: ["me"], queryFn: () => api.me(), staleTime: 60_000 });
  const myId = meQuery.data?.user.id;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Bumped after a post so the composer remounts empty.
  const [composerKey, setComposerKey] = useState(0);

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
      const previous = queryClient.getQueryData<CommentsCache>(
        qk.comments(taskId),
      );
      const now = new Date().toISOString();
      const optimistic = {
        id: `tmp-${crypto.randomUUID()}`,
        taskId,
        authorId: myId ?? "",
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
      setComposerKey((key) => key + 1);
      setNotice(input.mentions.length ? "Comment posted. Email notifications queued for tagged teammates." : "Comment posted.");
      queryClient.setQueryData<CommentsCache>(
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

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; text: string; mentions: CommentMention[] }) =>
      api.updateComment(input.id, input.text, input.mentions),
    onMutate: () => { setNotice(""); setError(null); },
    onSuccess: (data) => {
      setEditingId(null);
      setNotice("Comment updated.");
      queryClient.setQueryData<CommentsCache>(qk.comments(taskId), (old) =>
        old ? { comments: old.comments.map((comment) => (comment.id === data.comment.id ? data.comment : comment)) } : old,
      );
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => api.deleteComment(commentId),
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: qk.comments(taskId) });
      const previous = queryClient.getQueryData<CommentsCache>(qk.comments(taskId));
      queryClient.setQueryData<CommentsCache>(qk.comments(taskId), (old) =>
        old ? { comments: old.comments.filter((comment) => comment.id !== commentId) } : old,
      );
      setNotice("");
      setError(null);
      return { previous };
    },
    onSuccess: () => {
      setNotice("Comment deleted.");
      void queryClient.invalidateQueries({ queryKey: qk.activity(workspaceId, taskId) });
    },
    onError: (err: Error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(qk.comments(taskId), context.previous);
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
        {comments.map((comment) => {
          const pending = comment.id.startsWith("tmp-");
          const mine = Boolean(myId) && comment.authorId === myId;
          const canEdit = canWrite && mine && !pending;
          const canDelete = !pending && (mine || canModerate);
          const editing = editingId === comment.id;
          return (
            <li key={comment.id} id={`comment-${comment.id}`} className="group border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-medium text-[var(--foreground)]">
                  {memberName(members, comment.authorId)}
                </p>
                <div className="flex items-center gap-1">
                  <time
                    dateTime={comment.createdAt}
                    className="font-mono text-[10px] text-[var(--muted-foreground)]"
                  >
                    {new Date(comment.createdAt).toLocaleString()}
                  </time>
                  {comment.editedAt ? (
                    <span title={`Edited ${new Date(comment.editedAt).toLocaleString()}`} className="font-mono text-[10px] text-[var(--muted-foreground)]">
                      · edited
                    </span>
                  ) : null}
                  {!editing && canEdit ? (
                    <button
                      type="button"
                      aria-label="Edit comment"
                      title="Edit comment"
                      onClick={() => { setEditingId(comment.id); setError(null); setNotice(""); }}
                      className="ml-1 rounded-md p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--foreground)] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                    >
                      <Pencil size={12} aria-hidden />
                    </button>
                  ) : null}
                  {!editing && canDelete ? (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      title="Delete comment"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        if (!window.confirm(mine ? "Delete this comment?" : "Delete this comment for everyone?")) return;
                        deleteMutation.mutate(comment.id);
                      }}
                      className="rounded-md p-1 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-red-600 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:text-red-400 [@media(hover:none)]:opacity-100"
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>
              {editing ? (
                <div className="mt-2">
                  <CommentComposer
                    members={members}
                    initialBody={comment.body}
                    initialMentions={comment.mentions ?? []}
                    label="Edit comment"
                    submitLabel="Save"
                    pendingLabel="Saving…"
                    pending={updateMutation.isPending}
                    autoFocus
                    onCancel={() => setEditingId(null)}
                    onSubmit={(text, mentions) => updateMutation.mutate({ id: comment.id, text, mentions })}
                  />
                </div>
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--muted-foreground)]">
                  {renderComment(comment)}
                </p>
              )}
            </li>
          );
        })}
        {commentsQuery.isLoading ? (
          <li className="text-xs text-[var(--muted-foreground)]">Loading comments…</li>
        ) : comments.length === 0 ? (
          <li className="text-xs text-[var(--muted-foreground)]">No comments yet.</li>
        ) : null}
      </ul>
      {canWrite ? (
        <div className="mt-3">
          <CommentComposer
            key={composerKey}
            members={members}
            label="Comment · type @ to tag members"
            submitLabel="Comment"
            pendingLabel="Posting…"
            pending={createMutation.isPending}
            onSubmit={(text, mentions) => createMutation.mutate({ text, mentions })}
          />
        </div>
      ) : null}
      <p role="status" className="mt-2 text-xs text-[var(--muted-foreground)]">{notice}</p>
      {error ? (
        <p className="text-xs text-[var(--foreground)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

type ComposerProps = {
  members: WorkspaceMember[];
  initialBody?: string;
  initialMentions?: CommentMention[];
  label: string;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  autoFocus?: boolean;
  onCancel?: () => void;
  onSubmit: (text: string, mentions: CommentMention[]) => void;
};

/** A comment textarea with @-member suggestions; keeps tag offsets in step with edits. */
function CommentComposer({
  members,
  initialBody = "",
  initialMentions = [],
  label,
  submitLabel,
  pendingLabel,
  pending,
  autoFocus,
  onCancel,
  onSubmit,
}: ComposerProps) {
  const [body, setBody] = useState(initialBody);
  const [mentions, setMentions] = useState<CommentMention[]>(initialMentions);
  const [caret, setCaret] = useState(initialBody.length);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [active, setActive] = useState(0);
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
  const unchanged = body.trim() === initialBody.trim() && JSON.stringify(mentions) === JSON.stringify(initialMentions);

  useEffect(() => {
    if (showSuggestions) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [showSuggestions, listId, activeIndex]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = textarea.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

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

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim() || pending) return;
        if (unchanged && onCancel) { onCancel(); return; }
        const leading = body.length - body.trimStart().length;
        const text = body.trim();
        onSubmit(text, mentions.map((mention) => ({ ...mention, start: mention.start - leading, end: mention.end - leading })).filter((mention) => mention.start >= 0 && mention.end <= text.length));
      }}
    >
      <label htmlFor={`${listId}-input`} className={onCancel ? "sr-only" : "text-xs text-[var(--muted-foreground)]"}>{label}</label>
      <textarea
        ref={textarea} id={`${listId}-input`} value={body} maxLength={8000}
        disabled={pending}
        role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
        aria-expanded={showSuggestions} aria-controls={showSuggestions ? listId : undefined}
        aria-activedescendant={showSuggestions && suggestions.length ? `${listId}-${activeIndex}` : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setMentions(moveMentions(body, next, mentions)); setBody(next);
          setCaret(event.target.selectionStart); setActive(0); setSuggestionsOpen(true);
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        onFocus={() => setSuggestionsOpen(true)} onBlur={() => setSuggestionsOpen(false)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape" && (showSuggestions || onCancel)) {
            // Keep Escape from also closing the task drawer.
            event.preventDefault(); event.stopPropagation();
            if (showSuggestions) setSuggestionsOpen(false); else onCancel?.();
            return;
          }
          if (!showSuggestions) return;
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
      {mentions.length && !onCancel ? <p className="text-xs text-[var(--muted-foreground)]">Tagged: {[...new Set(mentions.map((mention) => memberName(members, mention.userId)))].join(", ")}. Teammates will be notified by email.</p> : null}
      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={!body.trim() || pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
