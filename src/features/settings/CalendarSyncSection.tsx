"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { SYNC_PROVIDER_LABEL, type SyncProviderId } from "@/src/core/calendar-sync";
import type { CalendarSyncStatus } from "@/src/server/calendar-sync/service";

const KEY = ["calendar-sync"] as const;
const when = (iso: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const RESULT: Record<string, string> = {
  "google-connected": "Google Calendar is connected. Your tasks are on their way to a “Noirly Flow” calendar.",
  "outlook-connected": "Outlook is connected. Your tasks are on their way to a “Noirly Flow” calendar.",
  cancelled: "Connecting was cancelled.",
  error: "Couldn't connect that calendar. Try again.",
};

/** Settings → two-way sync with Google Calendar and Outlook. */
export function CalendarSyncSection() {
  const result = useSearchParams().get("calendar");
  const status = useQuery({ queryKey: KEY, queryFn: () => api.calendarSync() });
  const calendars = status.data?.calendars ?? [];
  return (
    <section id="calendar-sync" aria-labelledby="calendar-sync-title" className="scroll-mt-6 border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Integrations</p>
      <h2 id="calendar-sync-title" className="mt-1 text-sm font-medium text-[var(--foreground)]">Two-way calendar sync</h2>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Flow makes a “Noirly Flow” calendar in your account with your dated tasks (assigned to you, or unassigned ones you
        created). Move, rename or delete an event there and the task follows: deleting clears its date. Your other calendars
        aren&apos;t read or changed.
      </p>
      {result && RESULT[result] ? <p role="status" className="mt-3 text-sm text-[var(--foreground)]">{RESULT[result]}</p> : null}
      {status.isPending ? <p className="mt-3 text-sm text-[var(--muted-foreground)]">Loading…</p> : null}
      {status.isError ? <p role="alert" className="mt-3 text-sm">Could not load calendar connections.</p> : null}
      <ul className="mt-3 flex flex-col gap-3">
        {calendars.map((calendar) => <CalendarRow key={calendar.provider} calendar={calendar} />)}
      </ul>
    </section>
  );
}

function CalendarRow({ calendar }: { calendar: CalendarSyncStatus }) {
  const queryClient = useQueryClient();
  const label = SYNC_PROVIDER_LABEL[calendar.provider as SyncProviderId];
  const [note, setNote] = useState<string | null>(null);
  const sync = useMutation({
    mutationFn: () => api.calendarSyncNow(calendar.provider),
    onMutate: () => setNote(null),
    onSuccess: (outcome) => {
      setNote(outcome.pulled + outcome.pushed + outcome.removed ? `Synced: ${outcome.pulled} from the calendar, ${outcome.pushed + outcome.removed} to it.` : "Already in step.");
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error: Error) => setNote(error.message),
  });
  const remove = useMutation({
    mutationFn: () => api.calendarDisconnect(calendar.provider),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
    onError: (error: Error) => setNote(error.message),
  });

  return (
    <li data-calendar={calendar.provider} className="flex flex-col gap-2 border border-[var(--hairline)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-sm font-medium text-[var(--foreground)]">{label}</span>
        {calendar.connected ? (
          <>
            <Button type="button" variant="secondary" disabled={sync.isPending} onClick={() => sync.mutate()}>
              {sync.isPending ? "Syncing…" : "Sync now"}
            </Button>
            <Button type="button" variant="secondary" disabled={remove.isPending} aria-label={`Disconnect ${label}`}
              onClick={() => { if (window.confirm(`Disconnect ${label}? The “Noirly Flow” calendar is removed from that account; your tasks stay.`)) remove.mutate(); }}>
              Disconnect
            </Button>
          </>
        ) : calendar.available ? (
          <a href={`/api/calendar-sync/${calendar.provider}/connect`} className="inline-flex h-10 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-ink)]">
            Connect {label}
          </a>
        ) : null}
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        {calendar.connected
          ? `${calendar.accountEmail ?? "Connected"} · ${calendar.lastSyncedAt ? `last synced ${when(calendar.lastSyncedAt)}` : "first sync on its way"} · syncs every few minutes while Flow is open`
          : calendar.available ? "Not connected." : "Not set up on this server yet."}
      </p>
      {calendar.lastError ? <p role="alert" className="text-xs text-[var(--accent)]">Last sync: {calendar.lastError}</p> : null}
      {note ? <p aria-live="polite" className="text-xs text-[var(--foreground)]">{note}</p> : null}
    </li>
  );
}
