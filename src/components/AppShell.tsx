"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import {
  AppShell as UIShell,
  SidebarBrand,
  type AppNavItem,
} from "@noirly-dev/ui";
import { SignOutButton } from "@/src/features/auth/SignOutButton";
import { CommandPalette } from "@/src/features/command-palette/CommandPalette";
import { TaskCreateDialog } from "@/src/features/task/TaskCreateDialog";
import { FocusTimer } from "@/src/features/focus/FocusTimer";
import { RunningTimerChip } from "@/src/features/time/TaskTime";
import { JoinedNotice } from "@/src/components/JoinedNotice";
import { CreateTeamWorkspace } from "@/src/features/workspace/CreateTeamWorkspace";
import { WorkspaceIcon } from "@/src/features/workspace/workspace-look";
import { LayoutPreferences } from "@/src/components/LayoutPreferences";
import { useOptimisticPath } from "@/src/components/NavLink";
import { ThemeControls } from "@/src/components/ThemeControls";
import { AppSwitcher } from "@/src/components/AppSwitcher";
import { NotificationBell } from "@/src/features/notifications/NotificationBell";
import { BrandMark } from "@/src/components/BrandMark";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useUIStore, readLastWorkspaceId } from "@/src/stores/ui-store";
import type { Workspace } from "@/src/core/sync/types";

export type ShellUser = {
  displayName: string;
  email: string;
};

type Props = {
  user: ShellUser;
  initialWorkspaces?: Workspace[];
  children: ReactNode;
};

const noSubscribe = () => () => {};

function isApplePlatform() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? "");
}

/** "⌘K" on Apple devices, "Ctrl K" elsewhere. The server render can't know, so it says Ctrl. */
function ShortcutLabel() {
  const apple = useSyncExternalStore(noSubscribe, isApplePlatform, () => false);
  return apple ? "⌘K" : "Ctrl K";
}

function workspaceLinkClass(active: boolean) {
  return [
    "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
    active
      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
      : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
  ].join(" ");
}

export function AppShell({ user, initialWorkspaces, children }: Props) {
  const taskDraft = useUIStore((state) => state.taskDraft);
  const path = useOptimisticPath();
  const lastWorkspaceId = useUIStore((state) => state.lastWorkspaceId);
  const setLastWorkspaceId = useUIStore((state) => state.setLastWorkspaceId);
  const workspacesQuery = useQuery({
    queryKey: qk.workspaces,
    queryFn: () => api.listWorkspaces(),
    initialData: initialWorkspaces
      ? { workspaces: initialWorkspaces }
      : undefined,
    staleTime: 60_000,
  });
  const workspaces = workspacesQuery.data?.workspaces ?? [];

  const pathWorkspaceId = path.startsWith("/w/") ? path.split("/")[2] : null;
  const workspaceId =
    pathWorkspaceId ?? lastWorkspaceId ?? workspaces[0]?.id ?? null;

  useEffect(() => {
    if (pathWorkspaceId) {
      setLastWorkspaceId(pathWorkspaceId);
      return;
    }
    if (!lastWorkspaceId) {
      const stored = readLastWorkspaceId();
      if (stored) setLastWorkspaceId(stored);
    }
  }, [pathWorkspaceId, lastWorkspaceId, setLastWorkspaceId]);

  const items: AppNavItem[] = [
    {
      href: "/settings",
      label: "Settings",
      icon: Settings,
      match: "prefix",
    },
    ...(workspaceId
      ? [
          {
            href: `/w/${workspaceId}/activity`,
            label: "Activity",
            icon: Activity,
            match: "prefix" as const,
          },
          {
            href: `/w/${workspaceId}/trash`,
            label: "Trash",
            icon: Trash2,
            match: "prefix" as const,
          },
          {
            href: `/w/${workspaceId}/members`,
            label: "Members",
            icon: Users,
            match: "prefix" as const,
          },
          {
            href: `/w/${workspaceId}/settings`,
            label: "Workspace",
            icon: SlidersHorizontal,
            match: "prefix" as const,
          },
        ]
      : []),
    {
      href: "/docs",
      label: "Docs",
      icon: BookOpen,
      match: "prefix",
    },
  ];

  return (
    // The app scrolls inside its own panes (task list, drawer, sidebar), not the
    // document. Lenis smooth-scrolls only the document and swallows wheel and
    // touchpad input over nested scrollers, which left them unscrollable.
    // `contents` keeps this wrapper out of the layout.
    <div data-lenis-prevent className="contents">
      <UIShell
        // Pin the shell to the viewport so the document never scrolls: the
        // sidebar and header stay put, and only the content pane (or the
        // workspace's own panes inside it) scrolls. With the default
        // `min-h-dvh`, a long page grew the document and carried the sidebar
        // away with it.
        className="h-dvh overflow-hidden"
        contentClassName="min-h-0 flex-1 overflow-y-auto"
        sidebar={{
          brand: (
            <SidebarBrand
              logo={<BrandMark className="h-5 w-5" />}
              title="Noirly Flow"
              subtitle="Workspace"
            />
          ),
          children: (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => useUIStore.getState().setCommandPaletteOpen(true)}
                aria-keyshortcuts="Control+K Meta+K"
                className="group flex w-full items-center justify-between rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-left text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                <span className="flex items-center gap-2">
                  <Search size={14} />
                  Search
                </span>
                {/* The shortcut is a hint for whoever is about to click: shown on
                    hover or keyboard focus only. */}
                <kbd
                  aria-hidden
                  className="rounded-md border border-[var(--hairline)] px-1.5 py-0.5 font-mono text-[10px] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  <ShortcutLabel />
                </kbd>
              </button>
              <div>
                <p className="px-1 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  Workspaces
                </p>
                <ul className="flex flex-col gap-0.5">
                  {workspaces.map((workspace) => {
                    const href = `/w/${workspace.id}`;
                    const active = workspaceId === workspace.id;
                    return (
                      <li key={workspace.id}>
                        <Link href={href} className={workspaceLinkClass(active)}>
                          <span className="flex min-w-0 items-center gap-2">
                            <WorkspaceIcon workspace={workspace} />
                            <span className="truncate">{workspace.name}</span>
                          </span>
                          {workspace.kind.toLowerCase() !==
                          workspace.name.toLowerCase() ? (
                            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide opacity-60">
                              {workspace.kind}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {workspacesQuery.isLoading && workspaces.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
                    Loading…
                  </p>
                ) : null}
                <CreateTeamWorkspace />
              </div>
            </div>
          ),
          items,
          footer: (
            <div className="space-y-3">
              <div>
                <p className="truncate text-sm">{user.displayName}</p>
                <p className="truncate font-mono text-[11px] text-[var(--muted-foreground)]">
                  {user.email}
                </p>
              </div>
              <SignOutButton />
            </div>
          ),
        }}
        header={{
          brand: (
            <p className="font-display text-sm font-semibold tracking-tight">
              Noirly Flow
            </p>
          ),
          actions: (
            // Search opens from the sidebar's Search button or ⌘K / Ctrl+K.
            <div className="flex items-center gap-1.5">
              <RunningTimerChip />
              <NotificationBell />
              <AppSwitcher current="flow" />
              <ThemeControls size="sm" />
            </div>
          ),
        }}
      >
        {/* data-content: the area the layout preferences apply to (see globals.css). */}
        <div data-content className="contents">{children}</div>
      </UIShell>
      <LayoutPreferences />
      <CommandPalette workspaces={workspaces} />
      {taskDraft ? <TaskCreateDialog draft={taskDraft} /> : null}
      <FocusTimer />
      <JoinedNotice path={path} workspaces={workspaces} />
    </div>
  );
}
