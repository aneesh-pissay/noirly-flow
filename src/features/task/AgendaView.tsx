"use client";

import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { agendaRange, agendaSections, UPCOMING_DAYS, type AgendaMode } from "@/src/features/task/agenda";
import { TaskSections } from "@/src/features/task/TaskSections";

const OPEN = "todo,in_progress";

/**
 * Today (overdue plus due today) or Upcoming (the next two weeks), across
 * every project in the workspace and its Inbox. Open tasks only; ticking one
 * marks it done.
 */
export function AgendaView({ workspaceId, mode }: { workspaceId: string; mode: AgendaMode }) {
  // "Today" and its date are the browser's; the server renders in its own zone and locale.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!mounted) return <p className="text-sm text-[var(--muted-foreground)]">Loading tasks…</p>;
  return <Agenda workspaceId={workspaceId} mode={mode} />;
}

const noSubscribe = () => () => {};

function Agenda({ workspaceId, mode }: { workspaceId: string; mode: AgendaMode }) {
  // The range is fixed per mount; it moves on at midnight when the page is next opened or refreshed.
  const [range] = useState(() => agendaRange(mode));
  const queryKey = qk.tasks(workspaceId, { view: mode, status: OPEN, ...range });
  const tasksQuery = useQuery({
    queryKey,
    queryFn: () => api.listTasks(workspaceId, { status: OPEN, ...range }),
    refetchInterval: 60_000,
  });

  const tasks = tasksQuery.data?.tasks ?? [];
  const sections = agendaSections(mode, tasks).map((section) =>
    section.key === "overdue" ? { ...section, tone: "alert" as const } : section);
  const heading = mode === "today" ? "Today" : "Upcoming";
  const subtitle = mode === "today"
    ? new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())
    : `The next ${UPCOMING_DAYS} days`;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">{heading}</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          {subtitle}{tasksQuery.data ? ` · ${tasks.length} open` : ""}
        </p>
      </header>
      {tasksQuery.isPending ? <p className="text-sm text-[var(--muted-foreground)]">Loading tasks…</p> : null}
      {tasksQuery.isError ? <p role="alert" className="text-sm">Could not load tasks. <button type="button" className="underline" onClick={() => void tasksQuery.refetch()}>Retry</button></p> : null}
      {tasksQuery.data && !sections.length ? (
        <p className="rounded-xl border border-dashed border-[var(--hairline)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          {mode === "today" ? "Nothing due today. Enjoy it." : "Nothing due in the next two weeks."}
        </p>
      ) : null}
      <TaskSections workspaceId={workspaceId} sections={sections} queryKey={queryKey} />
    </section>
  );
}
