"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";

/** Shown on an archived project's page: it still works, but is out of the sidebar, Today, Upcoming and filters. */
export function ArchivedProjectBanner({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const queryClient = useQueryClient();
  const canWrite = useCan("project.write");
  const unarchive = useMutation({
    mutationFn: () => api.updateProject(projectId, { archived: false }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.project(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.workspace(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: qk.projects(workspaceId) });
      void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
    },
  });
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
      <span>This project is archived. Its tasks are left out of Today, Upcoming, filters and the calendar feed.</span>
      {canWrite ? (
        <button type="button" disabled={unarchive.isPending} onClick={() => unarchive.mutate()}
          className="font-medium text-[var(--accent)] underline-offset-2 hover:underline disabled:opacity-50">
          {unarchive.isPending ? "Unarchiving…" : "Unarchive"}
        </button>
      ) : null}
    </div>
  );
}
