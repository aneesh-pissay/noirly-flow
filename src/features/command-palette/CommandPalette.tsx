"use client";

import { Command } from "cmdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useUIStore } from "@/src/stores/ui-store";
import type { Workspace } from "@/src/core/sync/types";
import { can } from "@/src/core/permissions/can";
import { FlowBusyScreen } from "@/src/components/FlowBusyScreen";

const itemClass =
  "flex cursor-pointer items-center justify-between px-3 py-2 text-sm text-[var(--foreground)] data-[selected=true]:bg-[var(--accent-soft)] data-[selected=true]:text-[var(--accent)]";
const headingClass =
  "mb-2 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.16em] [&_[cmdk-group-heading]]:text-[var(--muted-foreground)]";

type Props = {
  workspaces: Workspace[];
};

export function CommandPalette({ workspaces }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const open = useUIStore((state) => state.commandPaletteOpen);
  const setOpen = useUIStore((state) => state.setCommandPaletteOpen);
  const toggle = useUIStore((state) => state.toggleCommandPalette);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const activeWorkspaceId = pathname.startsWith("/w/")
    ? pathname.split("/")[2]
    : workspaces[0]?.id;
  const onInbox = pathname.includes("/inbox");
  const activeProjectId = pathname.includes("/p/")
    ? pathname.split("/p/")[1]?.split("/")[0]
    : undefined;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (busy) return;
        toggle();
        return;
      }

      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if (
        !inField &&
        event.key.toLowerCase() === "c" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen, toggle, busy]);

  const [wasActive, setWasActive] = useState(open || Boolean(busy));
  const active = open || Boolean(busy);
  if (wasActive !== active) {
    setWasActive(active);
  }
  if (wasActive && !active) {
    setQuery("");
    setDebounced("");
    setError(null);
  }

  const workspaceQuery = useQuery({
    queryKey: activeWorkspaceId
      ? qk.workspace(activeWorkspaceId)
      : ["workspaces", "none"],
    queryFn: () => api.getWorkspace(activeWorkspaceId!),
    enabled: open && Boolean(activeWorkspaceId),
  });
  const filtersQuery = useQuery({
    queryKey: activeWorkspaceId ? qk.filters(activeWorkspaceId) : ["filters", "none"],
    queryFn: () => api.listFilters(activeWorkspaceId!),
    enabled: open && Boolean(activeWorkspaceId),
  });
  const canWrite = can(
    workspaceQuery.data?.workspace.role ?? "member",
    "task.write",
  );

  const searchQuery = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api.search(debounced),
    enabled: open && debounced.length >= 2,
  });

  const createTitle = query.trim();
  const workspaceName = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.name ??
      "workspace",
    [workspaces, activeWorkspaceId],
  );

  function createTask(title: string) {
    if (!activeWorkspaceId || !title || !canWrite || busy) return;
    const projectId = onInbox ? null : activeProjectId || workspaceQuery.data?.projects[0]?.id || null;
    useUIStore.getState().openTaskForm({ workspaceId: activeWorkspaceId, projectId, title });
  }

  async function createProject(name: string) {
    if (!activeWorkspaceId || !name || !canWrite || busy) return;
    setBusy("Saving project");
    setError(null);
    try {
      const { project } = await api.createProject(activeWorkspaceId, { name });
      void queryClient.invalidateQueries({
        queryKey: qk.projects(activeWorkspaceId),
      });
      void queryClient.invalidateQueries({
        queryKey: qk.workspace(activeWorkspaceId),
      });
      setOpen(false);
      useUIStore.getState().setPendingHref(
        `/w/${activeWorkspaceId}/p/${project.id}`,
      );
      router.push(`/w/${activeWorkspaceId}/p/${project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project");
    } finally {
      setBusy(null);
    }
  }

  function go(href: string) {
    if (busy) return;
    setOpen(false);
    useUIStore.getState().setPendingHref(href.split("?")[0] ?? href);
    router.push(href);
  }

  return (
    <>
      {busy
        ? createPortal(<FlowBusyScreen label={busy} />, document.body)
        : null}
    <Command.Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
      }}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-[var(--bg)]/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 overflow-hidden border border-[var(--hairline)] bg-[var(--surface)]"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        disabled={Boolean(busy)}
        placeholder="Create a task, search, or jump…"
        className="h-12 w-full border-b border-[var(--hairline)] bg-transparent px-4 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] disabled:opacity-50"
      />
      <Command.List data-lenis-prevent className="max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
          {searchQuery.isFetching
            ? "Searching…"
            : workspaceQuery.isFetching
              ? "Loading…"
              : "No results."}
        </Command.Empty>

        {searchQuery.isFetching && debounced.length >= 2 ? (
          <p className="px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            <span className="busy-dots mr-2 text-[var(--foreground)]">···</span>
            Searching
          </p>
        ) : null}

        {createTitle && canWrite ? (
          <Command.Group heading="Actions" className={headingClass}>
            <Command.Item
              value={`create-task ${createTitle}`}
              disabled={Boolean(busy)}
              onSelect={() => void createTask(createTitle)}
              className={itemClass}
            >
              <span>Create task “{createTitle}”</span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                {workspaceName}
              </span>
            </Command.Item>
            <Command.Item
              value={`create-project ${createTitle}`}
              disabled={Boolean(busy)}
              onSelect={() => void createProject(createTitle)}
              className={itemClass}
            >
              <span>Create project “{createTitle}”</span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                {workspaceName}
              </span>
            </Command.Item>
          </Command.Group>
        ) : null}

        <Command.Group heading="Navigate" className={headingClass}>
          {activeWorkspaceId ? (
            <>
              <Command.Item
                value="today due overdue agenda"
                onSelect={() => go(`/w/${activeWorkspaceId}/today`)}
                className={itemClass}
              >
                Today
              </Command.Item>
              <Command.Item
                value="upcoming next two weeks agenda"
                onSelect={() => go(`/w/${activeWorkspaceId}/upcoming`)}
                className={itemClass}
              >
                Upcoming
              </Command.Item>
              <Command.Item
                value="filters saved searches new filter"
                onSelect={() => go(`/w/${activeWorkspaceId}/filters`)}
                className={itemClass}
              >
                Filters
              </Command.Item>
              {(filtersQuery.data?.filters ?? []).map((filter) => (
                <Command.Item
                  key={filter.id}
                  value={`filter ${filter.name} ${filter.id}`}
                  onSelect={() => go(`/w/${activeWorkspaceId}/filters/${filter.id}`)}
                  className={itemClass}
                >
                  Filter: {filter.name}
                </Command.Item>
              ))}
            </>
          ) : null}
          {activeWorkspaceId ? (
            <Command.Item
              value="inbox unfiled tasks"
              onSelect={() => go(`/w/${activeWorkspaceId}/inbox`)}
              className={itemClass}
            >
              Inbox
            </Command.Item>
          ) : null}
          {activeWorkspaceId ? (
            <Command.Item
              value="activity audit log"
              onSelect={() => go(`/w/${activeWorkspaceId}/activity`)}
              className={itemClass}
            >
              Activity
            </Command.Item>
          ) : null}
          {workspaces.map((workspace) => (
            <Command.Item
              key={workspace.id}
              value={`workspace ${workspace.name} ${workspace.slug}`}
              onSelect={() => go(`/w/${workspace.id}`)}
              className={itemClass}
            >
              <span>{workspace.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                {workspace.kind}
              </span>
            </Command.Item>
          ))}
          <Command.Item
            value="settings account"
            onSelect={() => go("/settings")}
            className={itemClass}
          >
            Settings
          </Command.Item>
        </Command.Group>

        {searchQuery.data?.tasks.length ? (
          <Command.Group heading="Tasks" className={headingClass}>
            {searchQuery.data.tasks.map((task) => (
              <Command.Item
                key={task.id}
                value={`task ${task.title}`}
                onSelect={() =>
                  go(
                    task.projectId
                      ? `/w/${task.workspaceId}/p/${task.projectId}?task=${task.id}`
                      : `/w/${task.workspaceId}/inbox?task=${task.id}`,
                  )
                }
                className={itemClass}
              >
                <span className="truncate">{task.title}</span>
                <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
                  {task.status.replaceAll("_", " ")}
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
      {error ? (
        <p className="border-t border-[var(--hairline)] px-4 py-2 text-xs text-[var(--foreground)]">
          {error}
        </p>
      ) : busy ? (
        <p className="border-t border-[var(--hairline)] px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
          <span className="busy-dots mr-2 text-[var(--foreground)]">···</span>
          {busy}
        </p>
      ) : (
        <p className="border-t border-[var(--hairline)] px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
          Esc to close · Enter to run
        </p>
      )}
    </Command.Dialog>
    </>
  );
}
