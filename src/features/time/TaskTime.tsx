"use client";

import { useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Play, Square, X } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { hoursLabel } from "@/src/core/capacity";
import { parseDuration, stopwatch } from "@/src/core/time-tracking";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";

/** The current second while `active` (a running timer), for a live stopwatch. */
function useNowSecond(active: boolean) {
  return useSyncExternalStore(
    (notify) => {
      if (!active) return () => {};
      const timer = window.setInterval(notify, 1000);
      return () => window.clearInterval(timer);
    },
    () => (active ? Math.floor(Date.now() / 1000) : 0),
    () => 0,
  );
}

export function useRunningTimer() {
  return useQuery({ queryKey: qk.runningTimer, queryFn: () => api.runningTimer(), refetchInterval: 60_000, refetchOnWindowFocus: true });
}

/** Refreshes everything a timer change touches. */
function useRefreshTime() {
  const queryClient = useQueryClient();
  return (taskId?: string) => {
    void queryClient.invalidateQueries({ queryKey: qk.runningTimer });
    if (taskId) void queryClient.invalidateQueries({ queryKey: qk.taskTime(taskId) });
  };
}

/** Drawer "Time": the task's tracked total, a start/stop timer, time added by hand, and the entries. */
export function TaskTime({ taskId, canWrite }: { taskId: string; canWrite: boolean }) {
  const refresh = useRefreshTime();
  const canManage = useCan("members.manage");
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const time = useQuery({ queryKey: qk.taskTime(taskId), queryFn: () => api.listTaskTime(taskId) });
  const running = useRunningTimer().data?.running;
  const mine = running?.entry.taskId === taskId;
  const nowSecond = useNowSecond(Boolean(mine));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const minutes = parseDuration(amount);

  const start = useMutation({ mutationFn: () => api.startTimer(taskId), onSettled: () => refresh(taskId) });
  const stop = useMutation({
    mutationFn: () => api.stopTimer(),
    onSettled: () => { refresh(taskId); if (running && running.entry.taskId !== taskId) refresh(running.entry.taskId); },
  });
  const add = useMutation({
    mutationFn: () => api.addTime(taskId, { minutes: minutes!, note: note.trim() || null }),
    onSuccess: () => { setAmount(""); setNote(""); },
    onSettled: () => refresh(taskId),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteTimeEntry(id), onSettled: () => refresh(taskId) });
  const error = start.error ?? stop.error ?? add.error ?? remove.error;
  const total = time.data?.totalMinutes ?? 0;

  return (
    <section aria-label="Time">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Time · {hoursLabel(total)} tracked
      </p>
      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          {mine ? (
            <button type="button" disabled={stop.isPending} onClick={() => stop.mutate()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 text-sm text-[var(--accent-ink)] disabled:opacity-50">
              <Square size={13} aria-hidden />Stop · <span className="font-mono tabular-nums">{stopwatch(nowSecond * 1000 - Date.parse(running!.entry.startedAt))}</span>
            </button>
          ) : (
            <button type="button" disabled={start.isPending} onClick={() => start.mutate()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--accent)] px-3 text-sm text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50">
              <Play size={13} aria-hidden />Start timer
            </button>
          )}
          {running && !mine ? <span className="text-xs text-[var(--muted-foreground)]">Stops your timer on “{running.taskTitle}”.</span> : null}
        </div>
      ) : null}
      {canWrite ? (
        <form className="mt-2 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (minutes) add.mutate(); }}>
          <input value={amount} onChange={(event) => setAmount(event.target.value)} aria-label="Time spent" placeholder="1h 30m"
            aria-invalid={Boolean(amount.trim() && !minutes)}
            className="h-9 w-24 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)]" />
          <input value={note} onChange={(event) => setNote(event.target.value)} aria-label="Note" placeholder="Note (optional)" maxLength={280}
            className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)]" />
          <button type="submit" disabled={!minutes || add.isPending} className="h-9 rounded-lg border border-[var(--hairline)] px-3 text-sm disabled:opacity-50">
            Add time
          </button>
          {amount.trim() && !minutes ? <p className="w-full text-xs text-[var(--accent)]">Try “45m”, “1h 30m” or “1:30”.</p> : null}
        </form>
      ) : null}
      {error ? <p role="alert" className="mt-1 text-xs text-[var(--accent)]">{(error as Error).message}</p> : null}
      {time.data?.entries.length ? (
        <ul className="mt-2 space-y-1" aria-label="Time entries">
          {time.data.entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <span className="w-14 shrink-0 font-mono text-[var(--foreground)]">{entry.minutes ? hoursLabel(entry.minutes) : "running"}</span>
              <span className="min-w-0 flex-1 truncate">
                {entry.userName} · {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(entry.startedAt))}
                {entry.note ? ` · ${entry.note}` : ""}
              </span>
              {entry.endedAt && (entry.userId === me.data?.user.id || canManage) ? (
                <button type="button" aria-label={`Delete ${entry.minutes ? hoursLabel(entry.minutes) : ""} entry`} disabled={remove.isPending}
                  onClick={() => remove.mutate(entry.id)} className="grid size-6 place-items-center rounded hover:text-[var(--foreground)]">
                  <X size={12} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Header: what you're tracking, how long, and a stop button. Nothing when no timer runs. */
export function RunningTimerChip() {
  const refresh = useRefreshTime();
  const running = useRunningTimer().data?.running;
  const nowSecond = useNowSecond(Boolean(running));
  const stop = useMutation({ mutationFn: () => api.stopTimer(), onSettled: () => refresh(running?.entry.taskId) });
  if (!running) return null;
  return (
    <div role="region" aria-label="Running timer" className="flex max-w-[16rem] items-center gap-2 rounded-xl border border-[var(--accent)] px-2 py-1 text-xs">
      <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-[var(--accent)]" />
      <Link href={`/w/${running.workspaceId}/t/${running.entry.taskId}`} className="min-w-0 truncate text-[var(--foreground)] hover:underline">
        {running.taskTitle}
      </Link>
      <span className="shrink-0 font-mono tabular-nums text-[var(--muted-foreground)]">{stopwatch(nowSecond * 1000 - Date.parse(running.entry.startedAt))}</span>
      <button type="button" aria-label="Stop timer" disabled={stop.isPending} onClick={() => stop.mutate()}
        className="grid size-6 shrink-0 place-items-center rounded hover:bg-[var(--surface-2)] disabled:opacity-50">
        <Square size={11} aria-hidden />
      </button>
    </div>
  );
}
