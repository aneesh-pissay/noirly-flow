"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { Download } from "lucide-react";
import { api } from "@/src/lib/api-client";
import type { BackupSettings } from "@/src/server/backups";
import { ImportSection } from "@/src/features/workspace/ImportSection";

const kickerClass = "font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]";
const linkButton = "inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--hairline)] px-4 text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)]";

const size = (bytes: number) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
const when = (iso: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Workspace settings → Data: downloads for everyone, backups for admins. */
export function DataSection({ workspaceId, isAdmin, canWrite }: { workspaceId: string; isAdmin: boolean; canWrite: boolean }) {
  return (
    <section id="data" aria-labelledby="data-title" className="scroll-mt-6 border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <p className={kickerClass}>Data</p>
      <h2 id="data-title" className="mt-1 text-sm font-medium text-[var(--foreground)]">Export</h2>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        {isAdmin
          ? "Everything in this workspace as JSON (projects, tasks, comments, time, goals, settings and members), or just the tasks as a spreadsheet. Files attached to tasks are listed by name, not included."
          : "This workspace's tasks as a spreadsheet."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {isAdmin ? (
          <a href={`/api/workspaces/${workspaceId}/export?format=json`} download className={linkButton}>
            <Download size={14} aria-hidden />Everything (JSON)
          </a>
        ) : null}
        <a href={`/api/workspaces/${workspaceId}/export?format=csv`} download className={linkButton}>
          <Download size={14} aria-hidden />Tasks (CSV)
        </a>
      </div>
      {canWrite ? <ImportSection workspaceId={workspaceId} /> : null}
      {isAdmin ? <Backups workspaceId={workspaceId} /> : null}
    </section>
  );
}

function Backups({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const key = ["backups", workspaceId] as const;
  const settings = useQuery({ queryKey: key, queryFn: () => api.backupSettings(workspaceId) });
  const [error, setError] = useState<string | null>(null);
  const schedule = useMutation({
    mutationFn: (input: { enabled: boolean; frequency: "daily" | "weekly" }) => api.setBackupSchedule(workspaceId, input),
    // The switch and the select move at once; a refusal puts them back.
    onMutate: (input) => {
      setError(null);
      const previous = queryClient.getQueryData<BackupSettings>(key);
      queryClient.setQueryData<BackupSettings>(key, (old) => (old ? { ...old, ...input } : old));
      return { previous };
    },
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onError: (err: Error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      setError(err.message);
    },
  });
  const now = useMutation({
    mutationFn: () => api.backUpNow(workspaceId),
    onMutate: () => setError(null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (err: Error) => setError(err.message),
  });

  if (settings.isPending) return <p className="mt-4 text-sm text-[var(--muted-foreground)]">Loading backups…</p>;
  if (settings.isError) return <p role="alert" className="mt-4 text-sm">Could not load backups.</p>;
  const data = settings.data;

  return (
    <div className="mt-5 border-t border-[var(--hairline)] pt-4">
      <h3 className="text-sm font-medium text-[var(--foreground)]">Backups</h3>
      {!data.available ? (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">Backups need file storage, which isn&apos;t set up on this server. Exports still work.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            A full JSON export, kept privately with your attachments. The latest 5 are kept.
            {data.lastRunAt ? ` Last backup ${when(data.lastRunAt)}.` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input type="checkbox" checked={data.enabled} disabled={schedule.isPending}
                onChange={(event) => schedule.mutate({ enabled: event.target.checked, frequency: data.frequency })} />
              Back up automatically
            </label>
            <select aria-label="How often" value={data.frequency} disabled={schedule.isPending || !data.enabled}
              onChange={(event) => schedule.mutate({ enabled: data.enabled, frequency: event.target.value as "daily" | "weekly" })}
              className="h-9 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-sm text-[var(--foreground)] disabled:opacity-60">
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
            </select>
            <Button type="button" variant="secondary" disabled={now.isPending} onClick={() => now.mutate()}>
              {now.isPending ? "Backing up…" : "Back up now"}
            </Button>
          </div>
          {error ? <p role="alert" className="mt-2 text-sm text-[var(--accent)]">{error}</p> : null}
          {data.backups.length ? (
            <ul aria-label="Backups" className="mt-3 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
              {data.backups.map((backup) => (
                <li key={backup.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="flex-1 text-[var(--foreground)]">{when(backup.createdAt)}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {backup.trigger === "manual" ? "By hand" : "Scheduled"} · {backup.taskCount} {backup.taskCount === 1 ? "task" : "tasks"} · {size(backup.sizeBytes)}
                  </span>
                  <a href={`/api/workspaces/${workspaceId}/backups/${backup.id}`} download className="text-xs underline" aria-label={`Download backup from ${when(backup.createdAt)}`}>
                    Download
                  </a>
                </li>
              ))}
            </ul>
          ) : <p className="mt-3 text-xs text-[var(--muted-foreground)]">No backups yet.</p>}
        </>
      )}
    </div>
  );
}
