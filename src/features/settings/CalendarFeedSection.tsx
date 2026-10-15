"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";

const QUERY_KEY = ["calendar-feed"] as const;

/** Google opens its "Add calendar" dialog for a subscription URL passed as `cid`. */
function googleAddUrl(feed: string) {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed.replace(/^https?:/, "webcal:"))}`;
}

export function CalendarFeedSection({ timezone }: { timezone: string | null }) {
  const queryClient = useQueryClient();
  // The secret is only returned when a link is made, so it lives in memory.
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const status = useQuery({ queryKey: QUERY_KEY, queryFn: () => api.calendarFeed() });

  const create = useMutation({
    mutationFn: () => api.createCalendarFeed(),
    onSuccess: (data) => {
      setUrl(data.url);
      setCopied(false);
      queryClient.setQueryData(QUERY_KEY, { enabled: true, createdAt: data.createdAt });
    },
  });
  const disable = useMutation({
    mutationFn: () => api.disableCalendarFeed(),
    onSuccess: (data) => {
      setUrl(null);
      queryClient.setQueryData(QUERY_KEY, data);
    },
  });

  const enabled = status.data?.enabled ?? false;
  const busy = create.isPending || disable.isPending;
  const error = create.error ?? disable.error;

  return (
    <section className="border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Integrations
      </p>
      <h2 className="mt-1 text-sm font-medium text-[var(--foreground)]">Calendar</h2>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Show due dates in Google Calendar, Apple Calendar or Outlook. The calendar holds tasks
        assigned to you, plus unassigned tasks you created, from every workspace you&apos;re in.
        It&apos;s read-only, and Google refreshes subscribed calendars every few hours.
      </p>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        Dates use your timezone{timezone ? ` (${timezone})` : ""}{timezone ? "" : " — set one in your profile below so dates land on the right day"}.
      </p>

      {status.isPending ? (
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">Loading…</p>
      ) : url ? (
        <div className="mt-4 flex flex-col gap-3">
          <label className="text-xs text-[var(--muted-foreground)]" htmlFor="calendar-feed-url">
            Your private calendar link. Anyone with it can see these tasks, so treat it like a password.
          </label>
          <div className="flex gap-2">
            <input
              id="calendar-feed-url"
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 font-mono text-xs text-[var(--foreground)]"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(url).then(() => setCopied(true), () => setCopied(false));
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={googleAddUrl(url)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-ink)]"
            >
              Add to Google Calendar
            </a>
            <p className="text-xs text-[var(--muted-foreground)]">
              Or in Google Calendar: Other calendars → + → From URL, and paste the link.
            </p>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            This link is shown once. If you lose it, make a new one.
          </p>
        </div>
      ) : enabled ? (
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          A calendar link is active
          {status.data?.createdAt ? ` (made ${new Date(status.data.createdAt).toLocaleDateString()})` : ""}.
          For your security it can&apos;t be shown again. Make a new link to see one; the old link stops working.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!status.isPending ? (
          <Button
            type="button"
            disabled={busy}
            variant={enabled ? "secondary" : "default"}
            onClick={() => {
              if (enabled && !window.confirm("Make a new link? Calendars using the current link will stop updating.")) return;
              create.mutate();
            }}
          >
            {create.isPending ? "Making link…" : enabled ? "Make a new link" : "Create calendar link"}
          </Button>
        ) : null}
        {enabled ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (!window.confirm("Turn off the calendar link? Subscribed calendars will stop updating.")) return;
              disable.mutate();
            }}
          >
            {disable.isPending ? "Turning off…" : "Turn off"}
          </Button>
        ) : null}
      </div>
      {error ? <p role="alert" className="mt-2 text-sm text-[var(--foreground)]">{error.message}</p> : null}
    </section>
  );
}
