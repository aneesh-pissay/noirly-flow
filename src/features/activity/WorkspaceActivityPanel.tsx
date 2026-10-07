"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@noirly-dev/ui";
import { ActivityFeed } from "@/src/features/activity/ActivityFeed";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";

type Props = {
  workspaceId: string;
  workspaceName: string;
};

export function WorkspaceActivityPanel({
  workspaceId,
  workspaceName,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => api.listMembers(workspaceId),
  });

  const exportMutation = useMutation({
    mutationFn: () => api.exportActivityCsv(workspaceId),
    onSuccess: ({ blob, filename }) => {
      setError(null);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download =
        filename ?? `${workspaceName.toLowerCase().replace(/\s+/g, "-")}-activity-${stamp}.csv`;
      anchor.click();
      // Revoking synchronously can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          Workspace-wide create, update, assign, and comment history.
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
        >
          {exportMutation.isPending ? "Exporting…" : "Export CSV"}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-[var(--foreground)]" role="alert">
          {error}
        </p>
      ) : null}
      <div className="border border-[var(--hairline)] bg-[var(--surface)] p-5">
        <ActivityFeed
          workspaceId={workspaceId}
          members={membersQuery.data?.members ?? []}
        />
      </div>
    </div>
  );
}
