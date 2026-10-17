"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { SavedFilter } from "@/src/core/sync/types";
import { FilterForm } from "@/src/features/filters/FilterForm";
import { useFilterContext } from "@/src/features/filters/use-filter-context";

/** /w/:id/filters — your saved filters, and a form for a new one. */
export function FiltersIndex({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const context = useFilterContext(workspaceId);
  const filters = useQuery({ queryKey: qk.filters(workspaceId), queryFn: () => api.listFilters(workspaceId) });
  const create = useMutation({
    mutationFn: (input: { name: string; query: string }) => api.createFilter(workspaceId, input),
    onSuccess: ({ filter }) => {
      queryClient.setQueryData<{ filters: SavedFilter[] }>(qk.filters(workspaceId), (old) => ({ filters: [...(old?.filters ?? []), filter] }));
      router.push(`/w/${workspaceId}/filters/${filter.id}`);
    },
  });

  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Filters</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">Saved searches across every project. Only you see your filters.</p>
      </header>
      {filters.data?.filters.length ? (
        <ul className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          {filters.data.filters.map((filter) => (
            <li key={filter.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <Link href={`/w/${workspaceId}/filters/${filter.id}`} className="text-sm text-[var(--foreground)] hover:underline">{filter.name}</Link>
              <code className="text-xs text-[var(--muted-foreground)]">{filter.query}</code>
            </li>
          ))}
        </ul>
      ) : filters.data ? (
        <p className="text-sm text-[var(--muted-foreground)]">No filters yet.</p>
      ) : null}
      <div className="max-w-xl rounded-2xl border border-[var(--hairline)] p-5">
        <h2 className="mb-3 text-base font-medium text-[var(--foreground)]">New filter</h2>
        <FilterForm context={context} submitLabel="Save filter" pending={create.isPending}
          error={create.error?.message} onSubmit={(value) => create.mutate(value)} />
      </div>
    </section>
  );
}
