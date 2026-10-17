"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { NavLink, useOptimisticPath } from "@/src/components/NavLink";

function navClass(active: boolean) {
  return cn(
    "block cursor-pointer truncate rounded-xl px-3 py-2 text-sm transition-colors",
    active
      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
      : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
  );
}

/** Sidebar: your saved filters, below the projects. */
export function FilterNav({ workspaceId }: { workspaceId: string }) {
  const path = useOptimisticPath();
  const filters = useQuery({ queryKey: qk.filters(workspaceId), queryFn: () => api.listFilters(workspaceId), staleTime: 60_000 });
  const base = `/w/${workspaceId}/filters`;
  return (
    <section className="mt-5">
      <div className="flex items-center justify-between px-2 pb-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Filters</p>
        <NavLink href={base} className="text-xs text-[var(--foreground)] hover:underline">
          {filters.data?.filters.length ? "Manage" : "New"}
        </NavLink>
      </div>
      <ul className="flex flex-col gap-1">
        {(filters.data?.filters ?? []).map((filter) => (
          <li key={filter.id}>
            <NavLink href={`${base}/${filter.id}`} className={navClass(path.startsWith(`${base}/${filter.id}`))}>
              {filter.name}
            </NavLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
