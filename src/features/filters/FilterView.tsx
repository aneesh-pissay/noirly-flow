"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { compileFilter } from "@/src/core/filter-query";
import type { SavedFilter } from "@/src/core/sync/types";
import { FilterForm } from "@/src/features/filters/FilterForm";
import { byDueThenPriority, useFilterContext } from "@/src/features/filters/use-filter-context";
import { TaskSections } from "@/src/features/task/TaskSections";

const OPEN = "todo,in_progress";

/**
 * One saved filter: its open matching tasks from every project and the
 * Inbox, with the name and query editable in place. The query runs in the
 * browser over the workspace's open tasks.
 */
export function FilterView({ workspaceId, filterId }: { workspaceId: string; filterId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const context = useFilterContext(workspaceId);
  const filters = useQuery({ queryKey: qk.filters(workspaceId), queryFn: () => api.listFilters(workspaceId) });
  const filter = filters.data?.filters.find((f) => f.id === filterId);
  const queryKey = qk.tasks(workspaceId, { view: "filter", status: OPEN });
  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => api.listTasks(workspaceId, { status: OPEN }),
    refetchInterval: 60_000,
  });

  const setFilters = (update: (list: SavedFilter[]) => SavedFilter[]) =>
    queryClient.setQueryData<{ filters: SavedFilter[] }>(qk.filters(workspaceId), (old) => ({ filters: update(old?.filters ?? []) }));
  const save = useMutation({
    mutationFn: (patch: { name: string; query: string }) => api.updateFilter(filterId, patch),
    onSuccess: ({ filter: saved }) => {
      setFilters((list) => list.map((f) => (f.id === saved.id ? saved : f)));
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteFilter(filterId),
    onSuccess: () => {
      setFilters((list) => list.filter((f) => f.id !== filterId));
      router.push(`/w/${workspaceId}/filters`);
    },
  });

  if (filters.isPending) return <p className="text-sm text-[var(--muted-foreground)]">Loading filter…</p>;
  if (!filter) return <p role="alert" className="text-sm">This filter doesn&apos;t exist, or it&apos;s someone else&apos;s.</p>;

  const compiled = context ? compileFilter(filter.query, context) : null;
  const matches = compiled?.ok ? (tasksQuery.data?.tasks ?? []).filter(compiled.test).sort(byDueThenPriority) : [];

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">{filter.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            <code>{filter.query}</code>{compiled?.ok && tasksQuery.data ? ` · ${matches.length} open` : ""}
          </p>
        </div>
        {!editing ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="min-h-9 rounded-xl border border-[var(--hairline)] px-3 text-sm">Edit</button>
            <button type="button" disabled={remove.isPending}
              onClick={() => { if (window.confirm(`Delete the filter “${filter.name}”? Its tasks stay as they are.`)) remove.mutate(); }}
              className="min-h-9 rounded-xl border border-[var(--hairline)] px-3 text-sm disabled:opacity-50">Delete</button>
          </div>
        ) : null}
      </header>
      {editing ? (
        <div className="max-w-xl rounded-2xl border border-[var(--hairline)] p-5">
          <FilterForm context={context} initial={filter} submitLabel="Save" pending={save.isPending}
            error={save.error?.message} onSubmit={(value) => save.mutate(value)} onCancel={() => setEditing(false)} />
        </div>
      ) : null}
      {compiled && !compiled.ok ? (
        <p role="alert" className="text-sm text-[var(--accent)]">This query no longer works: {compiled.error}. Edit it to fix.</p>
      ) : null}
      {tasksQuery.isPending || !context ? <p className="text-sm text-[var(--muted-foreground)]">Loading tasks…</p> : null}
      {compiled?.ok && tasksQuery.data && !matches.length ? (
        <p className="rounded-xl border border-dashed border-[var(--hairline)] p-6 text-center text-sm text-[var(--muted-foreground)]">No open tasks match.</p>
      ) : null}
      {matches.length ? (
        <TaskSections workspaceId={workspaceId} queryKey={queryKey}
          sections={[{ key: "matches", label: "Matching", tasks: matches }]} />
      ) : null}
    </section>
  );
}
