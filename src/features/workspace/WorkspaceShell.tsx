"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { PageContainer } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { ProjectNav } from "@/src/features/workspace/ProjectNav";
import { WorkspaceRoleProvider } from "@/src/features/workspace/WorkspaceRoleContext";

export function WorkspaceShell({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const workspaceQuery = useQuery({
    queryKey: qk.workspace(workspaceId),
    queryFn: () => api.getWorkspace(workspaceId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!workspaceQuery.data) return;
    queryClient.setQueryData(qk.projects(workspaceId), {
      projects: workspaceQuery.data.projects,
    });
  }, [queryClient, workspaceId, workspaceQuery.data]);

  // Until the membership check answers, render read-only: children load in
  // parallel, but someone who was removed never sees editing controls.
  const role = workspaceQuery.data?.workspace.role ?? "viewer";

  if (workspaceQuery.isError) {
    return (
      <PageContainer size="sm">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Workspace unavailable
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {(workspaceQuery.error as Error).message ||
            "This workspace could not be loaded."}
        </p>
      </PageContainer>
    );
  }

  return (
    <WorkspaceRoleProvider role={role}>
      <div className="flex h-full min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 border-b border-[var(--hairline)] bg-[var(--surface-2)]/40 lg:w-56 lg:border-b-0 lg:border-r">
          <div className="px-4 py-4 sm:px-6 lg:max-h-full lg:overflow-y-auto lg:py-5">
            <ProjectNav workspaceId={workspaceId} />
          </div>
        </aside>
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </WorkspaceRoleProvider>
  );
}
