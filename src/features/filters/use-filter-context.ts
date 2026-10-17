"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { FilterContext } from "@/src/core/filter-query";
import type { Task } from "@/src/core/sync/types";
import { useTags } from "@/src/features/tags/tags";

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;

/** Soonest due first (undated last), then priority, then title. */
export function byDueThenPriority(a: Task, b: Task) {
  const due = (t: Task) => (t.dueAt ? Date.parse(t.dueAt) : Number.POSITIVE_INFINITY);
  return due(a) - due(b) || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.title.localeCompare(b.title);
}

/** Who "me" is, and the workspace's projects, members and tags, for compiling filter queries. Null while loading. */
export function useFilterContext(workspaceId: string): FilterContext | null {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const workspace = useQuery({ queryKey: qk.workspace(workspaceId), queryFn: () => api.getWorkspace(workspaceId), staleTime: 60_000 });
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) });
  const tags = useTags(workspaceId);
  if (!me.data || !workspace.data || !members.data || !tags.data) return null;
  return {
    meId: me.data.user.id,
    projects: workspace.data.projects,
    members: members.data.members,
    tags: tags.data.tags,
  };
}
