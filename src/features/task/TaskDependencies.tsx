"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Task } from "@/src/core/sync/types";
import { openTaskInDrawer } from "@/src/features/task/TaskSubtasks";

const MAX_BLOCKERS = 20;
const isOpen = (status: string) => status === "todo" || status === "in_progress";

/**
 * "Blocked by": tasks that must be finished before this one can be, with a
 * search to add more; and "Blocking": the tasks waiting on this one.
 */
export function TaskDependencies({ workspaceId, task, value, onChange, canWrite }: {
  workspaceId: string;
  task: Task;
  value: string[];
  onChange: (blockedByIds: string[]) => void;
  canWrite: boolean;
}) {
  const [query, setQuery] = useState("");
  // Every live task in the workspace: names the blockers and offers new ones.
  const all = useQuery({
    queryKey: qk.tasks(workspaceId, { view: "dependencies" }),
    queryFn: () => api.listTasks(workspaceId, {}),
    staleTime: 30_000,
  });
  const blocking = useQuery({
    queryKey: ["blocking", task.id],
    queryFn: () => api.listBlocking(task.id),
  });
  const byId = new Map((all.data?.tasks ?? []).map((t) => [t.id, t]));
  const needle = query.trim().toLowerCase();
  const suggestions = needle
    ? (all.data?.tasks ?? [])
        .filter((t) => t.id !== task.id && !value.includes(t.id) && isOpen(t.status) && t.title.toLowerCase().includes(needle))
        .slice(0, 6)
    : [];

  return (
    <section aria-label="Dependencies" className="space-y-3">
      <div>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Blocked by{task.blocked ? " · waiting" : ""}
        </p>
        {value.length ? (
          <ul className="space-y-1">
            {value.map((id) => {
              const blocker = byId.get(id);
              const done = blocker ? !isOpen(blocker.status) : false;
              return (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <span aria-hidden className={done ? "text-[var(--muted-foreground)]" : "text-[var(--accent)]"}>{done ? "✓" : "●"}</span>
                  <button type="button" onClick={() => openTaskInDrawer(id)}
                    className={`min-w-0 flex-1 truncate text-left hover:underline ${done ? "text-[var(--muted-foreground)] line-through" : "text-[var(--foreground)]"}`}>
                    {blocker?.title ?? "A deleted task"}
                  </button>
                  {canWrite ? (
                    <button type="button" aria-label={`Stop waiting on ${blocker?.title ?? "this task"}`}
                      onClick={() => onChange(value.filter((other) => other !== id))}
                      className="grid size-6 place-items-center rounded text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                      <X size={13} aria-hidden />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">Nothing. It can be finished any time.</p>
        )}
        {canWrite && value.length < MAX_BLOCKERS ? (
          <div className="mt-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Find a task this waits on"
              placeholder="Waits on…" className="h-9 w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)]" />
            {suggestions.length ? (
              <ul className="mt-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface)]" aria-label="Matching tasks">
                {suggestions.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => { onChange([...value, t.id]); setQuery(""); }}
                      className="w-full truncate px-2 py-1.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)]">
                      {t.title}
                    </button>
                  </li>
                ))}
              </ul>
            ) : needle && all.data ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">No open task matches.</p> : null}
          </div>
        ) : null}
      </div>
      {blocking.data?.tasks.length ? (
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Blocking</p>
          <ul className="space-y-1">
            {blocking.data.tasks.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => openTaskInDrawer(t.id)} className="truncate text-left text-sm text-[var(--foreground)] hover:underline">
                  {t.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
