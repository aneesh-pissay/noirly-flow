"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, PageContainer, PageHeader } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Workspace } from "@/src/core/sync/types";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { TagManager } from "@/src/features/tags/tags";
import { TemplateManager } from "@/src/features/templates/templates";
import { useUIStore } from "@/src/stores/ui-store";
import { SpaceLinkSection } from "@/src/features/workspace/SpaceLinkSection";
import { WebhooksSection } from "@/src/features/webhooks/WebhooksSection";
import { WorkspaceCustomization } from "@/src/features/workspace/WorkspaceCustomization";
import { DataSection } from "@/src/features/workspace/DataSection";

const sectionClass = "border border-[var(--hairline)] bg-[var(--surface)] p-5 scroll-mt-6";
const kickerClass =
  "font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]";

export function WorkspaceSettingsView({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const canRename = useCan("workspace.manage");
  const canDelete = useCan("workspace.delete");
  const canEditTags = useCan("task.write");

  const workspaceQuery = useQuery({
    queryKey: qk.workspace(workspaceId),
    queryFn: () => api.getWorkspace(workspaceId),
    staleTime: 60_000,
  });
  const workspace = workspaceQuery.data?.workspace;
  const personal = workspace?.kind === "personal";

  const [name, setName] = useState("");
  const [confirmName, setConfirmName] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form once the workspace loads
    if (workspace) setName(workspace.name);
  }, [workspace]);

  const renameMutation = useMutation({
    mutationFn: () => api.updateWorkspace(workspaceId, name.trim()),
    onSuccess: (result) => {
      queryClient.setQueryData<{ workspaces: Workspace[] }>(qk.workspaces, (old) =>
        old
          ? {
              workspaces: old.workspaces.map((w) =>
                w.id === workspaceId ? result.workspace : w,
              ),
            }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: qk.workspace(workspaceId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteWorkspace(workspaceId),
    onSuccess: async () => {
      const remaining =
        queryClient
          .getQueryData<{ workspaces: Workspace[] }>(qk.workspaces)
          ?.workspaces.filter((w) => w.id !== workspaceId) ?? [];
      queryClient.setQueryData(qk.workspaces, { workspaces: remaining });
      queryClient.removeQueries({ queryKey: qk.workspace(workspaceId) });
      queryClient.removeQueries({ queryKey: ["tasks", workspaceId] });
      // Every user keeps a personal workspace, so there is always somewhere to land.
      const next = remaining.find((w) => w.kind === "personal") ?? remaining[0];
      if (next) useUIStore.getState().setLastWorkspaceId(next.id);
      const href = next ? `/w/${next.id}` : "/inbox";
      useUIStore.getState().setPendingHref(href);
      router.replace(href);
    },
  });

  if (!workspace) {
    return (
      <PageContainer size="sm">
        <p className="text-sm text-[var(--muted-foreground)]">
          {workspaceQuery.isError
            ? (workspaceQuery.error as Error).message
            : "Loading workspace…"}
        </p>
      </PageContainer>
    );
  }

  const trimmed = name.trim();
  const sections = [
    { id: "general", label: "General" },
    { id: "appearance", label: "Appearance" },
    { id: "defaults", label: "Defaults" },
    { id: "statuses", label: "Statuses" },
    { id: "tags", label: "Tags" },
    { id: "templates", label: "Templates" },
    { id: "data", label: "Data" },
    ...(!personal ? [{ id: "space", label: "Space" }] : []),
    ...(canRename ? [{ id: "webhooks", label: "Webhooks" }] : []),
    ...(!personal && canDelete ? [{ id: "danger", label: "Danger zone" }] : []),
  ];

  return (
    <PageContainer size="sm" className="max-w-2xl">
      <PageHeader
        kicker="Workspace"
        title={`${workspace.name} settings`}
        lead={
          personal
            ? "Your personal workspace is private to you. You can change how it looks and works, but not rename or delete it."
            : "How this workspace looks and works, its tags, templates and integrations."
        }
      />

      <nav aria-label="Settings sections" className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        {sections.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="text-[var(--muted-foreground)] underline-offset-2 hover:text-[var(--foreground)] hover:underline">
            {section.label}
          </a>
        ))}
      </nav>

      <section id="general" className={sectionClass}>
        <p className={kickerClass}>General</p>
        <h2 className="mt-1 text-sm font-medium text-[var(--foreground)]">Name</h2>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed || trimmed === workspace.name) return;
            renameMutation.mutate();
          }}
        >
          <Input
            value={name}
            maxLength={80}
            disabled={personal || !canRename}
            onChange={(event) => setName(event.target.value)}
            aria-label="Workspace name"
            className="flex-1"
          />
          {canRename && !personal ? (
            <Button
              type="submit"
              disabled={renameMutation.isPending || !trimmed || trimmed === workspace.name}
            >
              {renameMutation.isPending ? "Saving…" : "Save"}
            </Button>
          ) : null}
        </form>
        {!canRename && !personal ? (
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Only owners and admins can rename the workspace.
          </p>
        ) : null}
        {renameMutation.isError ? (
          <p className="mt-2 text-sm text-[var(--foreground)]" role="alert">
            {(renameMutation.error as Error).message}
          </p>
        ) : renameMutation.isSuccess ? (
          <p className="mt-2 font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Saved
          </p>
        ) : null}
      </section>

      <WorkspaceCustomization workspace={workspace} canEdit={canRename} />

      <section id="tags" className={sectionClass}>
        <p className={kickerClass}>Tags</p>
        <h2 className="mt-1 text-sm font-medium text-[var(--foreground)]">Names and colours</h2>
        <TagManager workspaceId={workspaceId} canEdit={canEditTags} />
      </section>

      <section id="templates" className={sectionClass}>
        <p className={kickerClass}>Templates</p>
        <h2 className="mt-1 text-sm font-medium text-[var(--foreground)]">Task and project templates</h2>
        <TemplateManager workspaceId={workspaceId} canEdit={canEditTags} />
      </section>

      <DataSection workspaceId={workspaceId} isAdmin={canRename} />

      {!personal ? <div id="space" className="scroll-mt-6"><SpaceLinkSection workspaceId={workspaceId} /></div> : null}

      {canRename ? <div id="webhooks" className="scroll-mt-6"><WebhooksSection workspaceId={workspaceId} /></div> : null}

      {!personal && canDelete ? (
        <section id="danger" className={`${sectionClass} border-red-500/40`}>
          <p className={`${kickerClass} text-red-600 dark:text-red-400`}>Danger zone</p>
          <h2 className="mt-1 text-sm font-medium text-[var(--foreground)]">
            Delete workspace
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Permanently deletes every project, task, comment and invite in this workspace,
            and removes all members. This can&apos;t be undone.
          </p>
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (confirmName !== workspace.name) return;
              deleteMutation.mutate();
            }}
          >
            <label className="space-y-1 text-xs text-[var(--muted-foreground)]">
              Type <span className="font-mono text-[var(--foreground)]">{workspace.name}</span> to
              confirm
              <Input
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                autoComplete="off"
              />
            </label>
            <div>
              <Button
                type="submit"
                disabled={deleteMutation.isPending || confirmName !== workspace.name}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete workspace"}
              </Button>
            </div>
          </form>
          {deleteMutation.isError ? (
            <p className="mt-2 text-sm text-[var(--foreground)]" role="alert">
              {(deleteMutation.error as Error).message}
            </p>
          ) : null}
        </section>
      ) : null}
    </PageContainer>
  );
}
