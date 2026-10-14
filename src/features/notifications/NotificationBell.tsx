"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@noirly-dev/ui";
import { DURATION, EASE_OUT } from "@noirly-dev/ui/motion";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { AppNotification } from "@/src/core/sync/types";

type Cache = { items: AppNotification[]; unread: number };

function describe(item: AppNotification) {
  switch (item.kind) {
    case "mention":
      return `${item.actorName} mentioned you on`;
    case "assigned":
      return `${item.actorName} assigned you`;
    case "comment":
      return `${item.actorName} commented on`;
  }
}

function ago(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/** Header bell: mentions, assignments and comments on your tasks. Polls once a minute. */
export function NotificationBell() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const query = useQuery({
    queryKey: qk.notifications,
    queryFn: () => api.listNotifications(),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.markNotificationsRead(ids),
    onMutate: (ids) => {
      queryClient.setQueryData<Cache>(qk.notifications, (old) => {
        if (!old) return old;
        const hit = (item: AppNotification) => !ids || ids.includes(item.id);
        const cleared = old.items.filter((item) => !item.read && hit(item)).length;
        return {
          items: old.items.map((item) => (hit(item) ? { ...item, read: true } : item)),
          unread: ids ? Math.max(0, old.unread - cleared) : 0,
        };
      });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.notifications }),
  });

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const items = query.data?.items ?? [];
  const unread = query.data?.unread ?? 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void query.refetch();
        }}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] text-[var(--text-secondary)] transition-colors hover:border-[var(--hairline-strong)] hover:text-[var(--text)]"
      >
        <Bell size={15} aria-hidden />
        {unread ? (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 font-mono text-[10px] leading-none text-[var(--accent-ink)]"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="fixed inset-x-4 top-16 z-50 w-auto overflow-hidden rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--elev-2)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-[22rem]"
          >
            <div className="flex items-center justify-between border-b border-[var(--hairline)] px-3 py-2">
              <p className="mono-label">Notifications</p>
              <button
                type="button"
                disabled={!unread || markRead.isPending}
                onClick={() => markRead.mutate(undefined)}
                className="cursor-pointer text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:cursor-default disabled:opacity-40"
              >
                Mark all read
              </button>
            </div>
            <ul data-lenis-prevent className="max-h-[min(26rem,60vh)] overflow-y-auto p-1">
              {query.isPending ? (
                <li className="px-3 py-4 text-sm text-[var(--muted-foreground)]">Loading…</li>
              ) : query.isError ? (
                <li className="px-3 py-4 text-sm text-[var(--foreground)]">
                  Could not load notifications.{" "}
                  <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button>
                </li>
              ) : items.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
                  You&apos;re all caught up.
                </li>
              ) : (
                items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!item.read) markRead.mutate([item.id]);
                        setOpen(false);
                        router.push(item.href);
                      }}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-[var(--r-md)] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-2)]",
                        item.read ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          item.read ? "bg-transparent" : "bg-[var(--accent)]",
                        )}
                      />
                      <span className="min-w-0 flex-1 text-sm">
                        {item.read ? null : <span className="sr-only">Unread: </span>}
                        {describe(item)} <span className="font-medium">“{item.taskTitle}”</span>
                      </span>
                      <time dateTime={item.createdAt} className="shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]">
                        {ago(item.createdAt)}
                      </time>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
