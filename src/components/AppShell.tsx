"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import {
  Activity,
  Search,
  Settings,
  Users,
} from "lucide-react";
import {
  AppShell as UIShell,
  SidebarBrand,
  type AppNavItem,
} from "@noirly-dev/ui";
import { SignOutButton } from "@/src/features/auth/SignOutButton";
import { CommandPalette } from "@/src/features/command-palette/CommandPalette";
import { CreateTeamWorkspace } from "@/src/features/workspace/CreateTeamWorkspace";
import { useOptimisticPath } from "@/src/components/NavLink";
import { ThemeControls } from "@/src/components/ThemeControls";
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

function workspaceLinkClass(active: boolean) {
  return [
    "flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm transition-colors",
    active
      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
      : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
  ].join(" ");
}

export function AppShell({ user, initialWorkspaces, children }: Props) {
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
            href: `/w/${workspaceId}/members`,
            label: "Members",
            icon: Users,
            match: "prefix" as const,
          },
        ]
      : []),
  ];

  return (
    <>
      <UIShell
        contentClassName="min-h-0 flex-1 overflow-hidden"
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
                className="flex w-full items-center justify-between rounded-xl border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-left text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                <span className="flex items-center gap-2">
                  <Search size={14} />
                  Search
                </span>
                <span className="font-mono text-[10px]">⌘K</span>
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
                          <span className="truncate">{workspace.name}</span>
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
            <>
              <ThemeControls size="sm" />
              <button
                type="button"
                onClick={() => useUIStore.getState().setCommandPaletteOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--hairline)] font-mono text-sm text-[var(--muted-foreground)]"
                aria-label="Open search"
              >
                ⌘K
              </button>
            </>
          ),
        }}
      >
        {children}
      </UIShell>
      <CommandPalette workspaces={workspaces} />
    </>
  );
}
