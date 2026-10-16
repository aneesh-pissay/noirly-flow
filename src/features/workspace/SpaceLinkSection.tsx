"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";

const sectionClass = "border border-[var(--hairline)] bg-[var(--surface)] p-5";
const kickerClass =
  "font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]";
const selectClass =
  "h-10 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-2 text-sm text-[var(--foreground)]";

/**
 * Link a team workspace to a Noirly space (one team across every Noirly app).
 * While linked, the space's member list decides who's here.
 */
export function SpaceLinkSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const canManage = useCan("workspace.manage");
  const [spaceId, setSpaceId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: qk.space(workspaceId),
    queryFn: () => api.spaceStatus(workspaceId),
    staleTime: 30_000,
    // Identity being down shouldn't leave this on "Loading…" through three retries.
    retry: 1,
  });
  const status = statusQuery.data;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.space(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.workspace(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: qk.workspaces });
  };
  const describe = (result: { status: string; added?: number; removed?: number; changed?: number }) =>
    result.status === "unlinked"
      ? "The space no longer exists, so this team was unlinked. Its members stay."
      : `Synced: ${result.added ?? 0} added, ${result.removed ?? 0} removed, ${result.changed ?? 0} role changes.`;

  const linkMutation = useMutation({
    mutationFn: () => api.linkSpace(workspaceId, spaceId),
    onSuccess: ({ result }) => {
      setNotice(describe(result));
      setSpaceId("");
      refresh();
    },
  });
  const createMutation = useMutation({
    mutationFn: () => api.createSpaceFromWorkspace(workspaceId),
    onSuccess: ({ dropped }) => {
      setNotice(
        dropped > 0
          ? `Space created. ${dropped} ${dropped === 1 ? "person" : "people"} without a verified Noirly account couldn't join and lost access.`
          : "Space created with everyone in this team.",
      );
      refresh();
    },
  });
  const syncMutation = useMutation({
    mutationFn: () => api.syncSpace(workspaceId),
    onSuccess: ({ result }) => {
      setNotice(describe(result));
      refresh();
    },
  });
  const unlinkMutation = useMutation({
    mutationFn: () => api.unlinkSpace(workspaceId),
    onSuccess: () => {
      setNotice("Unlinked. Manage members here in Flow again.");
      refresh();
    },
  });

  const busy =
    linkMutation.isPending || createMutation.isPending || syncMutation.isPending || unlinkMutation.isPending;
  const error = [linkMutation, createMutation, syncMutation, unlinkMutation].find((m) => m.isError)?.error;

  return (
    <section className={sectionClass} aria-labelledby="space-title">
      <p className={kickerClass}>Noirly space</p>
      <h2 id="space-title" className="mt-1 text-sm font-medium text-[var(--foreground)]">
        Share this team across Noirly apps
      </h2>

      {statusQuery.isPending ? (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">Loading…</p>
      ) : statusQuery.isError ? (
        <p className="mt-3 text-sm text-[var(--foreground)]" role="alert">
          {(statusQuery.error as Error).message}
        </p>
      ) : status?.link ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-[var(--foreground)]">
            Linked to <span className="font-medium">{status.link.spaceName ?? "a space"}</span>. Members and roles
            come from the space: add or remove people there and it applies here and in every linked app.
          </p>
          {status.link.syncedAt ? (
            <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Last synced {new Date(status.link.syncedAt).toLocaleString()}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <a
              href={status.manageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center rounded-xl border border-[var(--hairline)] px-4 text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)]"
            >
              Manage members
            </a>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => syncMutation.mutate()}>
              {syncMutation.isPending ? "Syncing…" : "Sync now"}
            </Button>
            {canManage ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm("Unlink from the space? Current members stay, and you manage them in Flow again.")) return;
                  unlinkMutation.mutate();
                }}
              >
                Unlink
              </Button>
            ) : null}
          </div>
        </div>
      ) : !canManage ? (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Not linked. Owners and admins can link this team to a Noirly space.
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-xs text-[var(--muted-foreground)]">
            A space is one member list for Flow, Ledger, Split and Pulse. Once linked, people are added and removed in
            the space, and Flow invites are turned off. Spaces have no viewer role, so viewers become members.
          </p>
          {status && status.linkable.length > 0 ? (
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (!spaceId) return;
                if (!window.confirm("Link to this space? Anyone here who isn't in the space loses access.")) return;
                linkMutation.mutate();
              }}
            >
              <select
                value={spaceId}
                aria-label="Space to link"
                onChange={(event) => setSpaceId(event.target.value)}
                className={`${selectClass} min-w-[12rem] flex-1`}
              >
                <option value="">Choose a space…</option>
                {status.linkable.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.name} · {space.memberCount} {space.memberCount === 1 ? "person" : "people"}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={busy || !spaceId}>
                {linkMutation.isPending ? "Linking…" : "Link"}
              </Button>
            </form>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                if (!window.confirm("Create a new space with everyone in this team, and link it?")) return;
                createMutation.mutate();
              }}
            >
              {createMutation.isPending ? "Creating…" : "Create a space from this team"}
            </Button>
            <a
              href={status?.manageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:underline"
            >
              Your spaces
            </a>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-3 text-sm text-[var(--foreground)]" role="alert">
          {(error as Error).message}
        </p>
      ) : notice ? (
        <p role="status" className="mt-3 font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
