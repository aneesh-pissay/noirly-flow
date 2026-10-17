"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Tag } from "@/src/core/sync/types";

/** Tag colours: shown as a dot beside the name, so each reads on light and dark themes alike. */
export const TAG_COLORS = [
  { value: "#52D3FE", name: "Sky" },
  { value: "#4ADE80", name: "Green" },
  { value: "#FACC15", name: "Yellow" },
  { value: "#FB923C", name: "Orange" },
  { value: "#F87171", name: "Red" },
  { value: "#F472B6", name: "Pink" },
  { value: "#A78BFA", name: "Violet" },
  { value: "#94A3B8", name: "Slate" },
] as const;

export function useTags(workspaceId: string) {
  return useQuery({ queryKey: qk.tags(workspaceId), queryFn: () => api.listTags(workspaceId), staleTime: 60_000 });
}

/** A task's tags as small coloured chips; ids for tags that no longer exist are skipped. */
export function TagChips({ tagIds, tags }: { tagIds: string[]; tags: Tag[] }) {
  if (!tagIds.length) return null;
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  return (
    <>
      {tagIds.flatMap((id) => {
        const tag = byId.get(id);
        if (!tag) return [];
        return [
          <span key={id} className="inline-flex items-center gap-1 font-mono text-[11px] tracking-wide text-[var(--muted-foreground)]">
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />@{tag.name}
          </span>,
        ];
      })}
    </>
  );
}

/** TagChips for a task row, reading the workspace's tags from the shared query. */
export function TaskTagChips({ workspaceId, tagIds }: { workspaceId: string; tagIds: string[] }) {
  const tags = useTags(workspaceId).data?.tags ?? [];
  return <TagChips tagIds={tagIds} tags={tags} />;
}

/** Toggle a task's tags, or make a new one (added to the task straight away). */
export function TagPicker({ workspaceId, value, onChange, disabled = false }: {
  workspaceId: string;
  value: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const tags = useTags(workspaceId).data?.tags ?? [];
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.createTag(workspaceId, { name: name.trim().replace(/^@/, "") }),
    onSuccess: ({ tag }) => {
      setName("");
      queryClient.setQueryData<{ tags: Tag[] }>(qk.tags(workspaceId), (old) => ({
        tags: [...(old?.tags ?? []).filter((t) => t.id !== tag.id), tag].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      if (!value.includes(tag.id)) onChange([...value, tag.id]);
    },
  });

  return (
    <div className="space-y-2">
      <div role="group" aria-label="Tags" className="flex flex-wrap gap-1.5">
        {tags.map((tag) => {
          const on = value.includes(tag.id);
          return (
            <button key={tag.id} type="button" aria-pressed={on} disabled={disabled}
              onClick={() => onChange(on ? value.filter((id) => id !== tag.id) : [...value, tag.id])}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs ${on ? "border-[var(--accent)] text-[var(--foreground)]" : "border-[var(--hairline)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"} disabled:opacity-50`}>
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
              {tag.name}
            </button>
          );
        })}
        {!tags.length ? <span className="text-xs text-[var(--muted-foreground)]">No tags yet.</span> : null}
      </div>
      {!disabled ? (
        <div className="flex gap-2">
          <input value={name} maxLength={40} aria-label="New tag" placeholder="New tag"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              // Enter adds the tag rather than submitting the form around it.
              if (event.key === "Enter") { event.preventDefault(); if (name.trim()) create.mutate(); }
            }}
            className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 text-xs text-[var(--foreground)]" />
          <button type="button" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}
            className="h-8 rounded-lg border border-[var(--hairline)] px-3 text-xs disabled:opacity-50">
            {create.isPending ? "Adding…" : "Add"}
          </button>
        </div>
      ) : null}
      {create.isError ? <p role="alert" className="text-xs text-[var(--accent)]">{(create.error as Error).message}</p> : null}
    </div>
  );
}

/** Workspace settings: rename, recolour or delete tags. */
export function TagManager({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const tags = useTags(workspaceId).data?.tags ?? [];
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.tags(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
  };
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; color?: string } }) => api.updateTag(id, patch),
    onMutate: () => setError(null),
    onError: (err: Error) => setError(err.message),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTag(id),
    onMutate: () => setError(null),
    onError: (err: Error) => setError(err.message),
    onSettled: refresh,
  });

  if (!tags.length) return <p className="mt-3 text-sm text-[var(--muted-foreground)]">No tags yet. Add them from a task.</p>;
  return (
    <div className="mt-4 space-y-3">
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      <ul className="space-y-3">
        {tags.map((tag) => (
          <li key={tag.id} className="flex flex-wrap items-center gap-2">
            <input key={tag.name} defaultValue={tag.name} maxLength={40} aria-label={`Name of tag ${tag.name}`} disabled={!canEdit}
              onBlur={(event) => {
                const name = event.currentTarget.value.trim();
                if (name && name !== tag.name) update.mutate({ id: tag.id, patch: { name } });
                else event.currentTarget.value = tag.name;
              }}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
              className="h-9 w-40 rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 text-sm text-[var(--foreground)] disabled:opacity-60" />
            <div role="radiogroup" aria-label={`Colour of tag ${tag.name}`} className="flex gap-1">
              {TAG_COLORS.map((color) => (
                <button key={color.value} type="button" role="radio" aria-checked={tag.color.toLowerCase() === color.value.toLowerCase()}
                  aria-label={color.name} title={color.name} disabled={!canEdit}
                  onClick={() => update.mutate({ id: tag.id, patch: { color: color.value } })}
                  className={`size-6 rounded-full border-2 ${tag.color.toLowerCase() === color.value.toLowerCase() ? "border-[var(--foreground)]" : "border-transparent"} disabled:opacity-60`}
                  style={{ backgroundColor: color.value }} />
              ))}
            </div>
            {canEdit ? (
              <button type="button" disabled={remove.isPending}
                onClick={() => { if (window.confirm(`Delete the tag “${tag.name}”? It comes off every task that has it.`)) remove.mutate(tag.id); }}
                className="h-9 px-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50">
                Delete
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
