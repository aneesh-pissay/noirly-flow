"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { describeActivity } from "@/src/features/activity/format";
import type { WorkspaceMember } from "@/src/features/workspace/members";

type Props = {
  workspaceId: string;
  taskId?: string;
  members: WorkspaceMember[];
};

export function ActivityFeed({ workspaceId, taskId, members }: Props) {
  const activityQuery = useInfiniteQuery({
    queryKey: qk.activity(workspaceId, taskId),
    queryFn: ({ pageParam }) =>
      api.listActivity(workspaceId, {
        taskId,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
  });

  const items = activityQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section>
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
        Activity
      </p>
      {activityQuery.isLoading ? (
        <p className="text-xs text-[var(--muted-foreground)]">Loading activity…</p>
      ) : activityQuery.isError && items.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]" role="alert">
          Could not load activity.
        </p>
      ) : items.length === 0 ? (
        <p className="text-xs text-[var(--muted-foreground)]">No activity yet.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((event) => (
            <li key={event.id} className="flex flex-col gap-0.5">
              <p className="text-xs text-[var(--muted-foreground)]">
                {describeActivity(event, members)}
              </p>
              <time
                dateTime={event.createdAt}
                className="font-mono text-[10px] text-[var(--muted-foreground)]"
              >
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      )}
      {activityQuery.isFetchNextPageError ? (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]" role="alert">
          Could not load more activity.
        </p>
      ) : null}
      {activityQuery.hasNextPage ? (
        <button
          type="button"
          onClick={() => void activityQuery.fetchNextPage()}
          disabled={activityQuery.isFetchingNextPage}
          className="mt-3 text-xs text-[var(--foreground)] hover:underline disabled:opacity-50"
        >
          {activityQuery.isFetchingNextPage
            ? "Loading…"
            : activityQuery.isFetchNextPageError
              ? "Try again"
              : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
