"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Workspace } from "@/src/core/sync/types";

type Notice = { workspaceId: string; already: boolean };

/**
 * Confirms an accepted invite. The invite page redirects to `/w/<id>?joined=1`
 * (or `=already`); this reads that once, drops it from the URL so a reload or a
 * shared link doesn't repeat it, and shows a dismissible notice.
 */
export function JoinedNotice({ path, workspaces }: { path: string; workspaces: Workspace[] }) {
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const joined = url.searchParams.get("joined");
    const workspaceId = url.pathname.startsWith("/w/") ? url.pathname.split("/")[2] : null;
    if (!joined || !workspaceId) return;
    url.searchParams.delete("joined");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the URL once on arrival
    setNotice({ workspaceId, already: joined === "already" });
  }, [path]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  const name = workspaces.find((w) => w.id === notice.workspaceId)?.name ?? "the workspace";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-4 z-[95] flex w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-[var(--r-lg)] border border-[var(--accent)] bg-[var(--surface)] px-4 py-3 shadow-[var(--elev-2)]"
    >
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--accent)]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--foreground)]">
          {notice.already ? `You're already in ${name}` : `You've joined ${name}`}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          {notice.already
            ? "That invite was for a workspace you already belong to."
            : "Welcome aboard. Its projects are in the sidebar."}
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setNotice(null)}
        className="cursor-pointer rounded-lg p-1 text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}
