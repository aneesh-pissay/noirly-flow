"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageContainer, PageHeader } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { MembersPanel } from "@/src/features/workspace/MembersPanel";

export function MembersView({ workspaceId }: { workspaceId: string }) {
  const workspaceQuery = useQuery({
    queryKey: qk.workspace(workspaceId),
    queryFn: () => api.getWorkspace(workspaceId),
    staleTime: 60_000,
  });
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me(),
    staleTime: 60_000,
  });
  const canManage = useCan("members.manage");
  const name = workspaceQuery.data?.workspace.name ?? "Workspace";
  const workspace = workspaceQuery.data?.workspace;
  const linkedSpace = workspace?.spaceId ? (workspace.spaceName ?? "a Noirly space") : null;

  return (
    <PageContainer size="md">
      <PageHeader
        kicker="Team"
        title={`${name} members`}
        lead={
          linkedSpace
            ? `Members come from the space "${linkedSpace}". Add, remove or change roles there; it applies here automatically.`
            : "Roles: owner, admin, member, viewer. Viewers cannot edit tasks."
        }
      />
      {linkedSpace ? (
        <p className="mb-4 text-xs text-[var(--muted-foreground)]">
          <Link href={`/w/${workspaceId}/settings`} className="text-[var(--foreground)] hover:underline">
            Space settings
          </Link>
        </p>
      ) : null}
      {meQuery.data ? (
        <MembersPanel
          workspaceId={workspaceId}
          currentUserId={meQuery.data.user.id}
          canManage={canManage && !linkedSpace}
        />
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">Loading members…</p>
      )}
    </PageContainer>
  );
}
