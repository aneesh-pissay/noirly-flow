"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, PageContainer, PageHeader } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Task, TrashedTask } from "@/src/core/sync/types";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";

function taskHref(workspaceId: string, task: Task) {
  const base = task.projectId ? `/w/${workspaceId}/p/${task.projectId}` : `/w/${workspaceId}/inbox`;
  return `${base}?task=${task.id}`;
}

export function TrashView({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const canRestore = useCan("task.write");
  const [restored, setRestored] = useState<Task | null>(null);
  const workspaceQuery = useQuery({
    queryKey: qk.workspace(workspaceId),
    queryFn: () => api.getWorkspace(workspaceId),
    staleTime: 60_000,
  });
  const trashQuery = useQuery({
    queryKey: qk.trash(workspaceId),
    queryFn: () => api.listTrash(workspaceId),
  });
  const name = workspaceQuery.data?.workspace.name ?? "Workspace";

  const restoreMutation = useMutation({
    mutationFn: (taskId: string) => api.restoreTask(taskId),
    onSuccess: ({ task }) => {
      setRestored(task);
      queryClient.setQueryData<{ items: TrashedTask[] }>(qk.trash(workspaceId), (old) =>
        old ? { items: old.items.filter((item) => item.task.id !== task.id) } : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["activity", workspaceId] });
    },
  });

  const items = trashQuery.data?.items ?? [];

  return (
    <PageContainer size="md">
      <PageHeader kicker="Trash" title={`Deleted in ${name}`} />
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          Deleted tasks wait here until someone restores them. A task whose project was deleted goes back to the Inbox.
        </p>
        <p role="status" className="text-sm text-[var(--muted-foreground)]">
          {restored ? (
            <>
              Restored “{restored.title}”.{" "}
              <Link href={taskHref(workspaceId, restored)} className="underline hover:text-[var(--foreground)]">
                Open it
              </Link>
            </>
          ) : null}
        </p>
        {restoreMutation.error ? (
          <p role="alert" className="text-sm text-[var(--foreground)]">{restoreMutation.error.message}</p>
        ) : null}
        <div className="border border-[var(--hairline)] bg-[var(--surface)]">
          {trashQuery.isPending ? (
            <p className="p-5 text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : trashQuery.isError ? (
            <p className="p-5 text-sm text-[var(--foreground)]">
              Could not load the trash.{" "}
              <button type="button" className="underline" onClick={() => void trashQuery.refetch()}>Try again</button>
            </p>
          ) : items.length === 0 ? (
            <p className="p-5 text-sm text-[var(--muted-foreground)]">The trash is empty.</p>
          ) : (
            <ul className="divide-y divide-[var(--hairline)]">
              {items.map(({ task, projectName, projectDeleted }) => (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[var(--foreground)]">{task.title}</p>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                      {projectName ?? "Inbox"}
                      {projectDeleted ? " (project deleted)" : ""}
                      {task.deletedAt ? ` · deleted ${new Date(task.deletedAt).toLocaleString()}` : ""}
                    </p>
                  </div>
                  {canRestore ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={restoreMutation.isPending && restoreMutation.variables === task.id}
                      onClick={() => restoreMutation.mutate(task.id)}
                    >
                      {restoreMutation.isPending && restoreMutation.variables === task.id ? "Restoring…" : "Restore"}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
