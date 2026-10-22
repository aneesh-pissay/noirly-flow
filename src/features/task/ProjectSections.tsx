"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Section, Task } from "@/src/core/sync/types";

export function useSections(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? qk.sections(projectId) : ["sections", "none"],
    queryFn: () => api.listSections(projectId!),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });
}

/**
 * "No section" first (only when it has tasks, unless there are no sections at
 * all), then every section in order, empty or not. A task pointing at a
 * section that no longer exists counts as no section.
 */
export function groupBySection(tasks: Task[], sections: Section[]) {
  const known = new Set(sections.map((section) => section.id));
  const loose = tasks.filter((task) => !task.sectionId || !known.has(task.sectionId));
  return [
    ...(loose.length || !sections.length ? [{ section: null, tasks: loose }] : []),
    ...sections.map((section) => ({ section, tasks: tasks.filter((task) => task.sectionId === section.id) })),
  ];
}

function useSectionCache(projectId: string) {
  const queryClient = useQueryClient();
  return {
    set: (update: (list: Section[]) => Section[]) =>
      queryClient.setQueryData<{ sections: Section[] }>(qk.sections(projectId), (old) => ({ sections: update(old?.sections ?? []) })),
    refreshTasks: (workspaceId: string) => void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] }),
  };
}

const headingClass = "font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]";

/** A section's heading, with rename and delete for people who can edit. */
export function SectionHeader({ workspaceId, section, count, canWrite }: {
  workspaceId: string;
  section: Section;
  count: number;
  canWrite: boolean;
}) {
  const cache = useSectionCache(section.projectId);
  const [renaming, setRenaming] = useState(false);
  const rename = useMutation({
    mutationFn: (name: string) => api.updateSection(section.id, { name }),
    onSuccess: ({ section: saved }) => {
      cache.set((list) => list.map((s) => (s.id === saved.id ? saved : s)));
      setRenaming(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.deleteSection(section.id),
    onSuccess: () => {
      cache.set((list) => list.filter((s) => s.id !== section.id));
      cache.refreshTasks(workspaceId);
    },
  });

  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      {renaming ? (
        <form className="flex gap-2" onSubmit={(event) => {
          event.preventDefault();
          const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
          if (name && name !== section.name) rename.mutate(name);
          else setRenaming(false);
        }}>
          <input name="name" defaultValue={section.name} maxLength={60} autoFocus aria-label="Section name"
            className="h-8 rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 text-sm text-[var(--foreground)]" />
          <button type="submit" disabled={rename.isPending} className="h-8 px-2 text-xs">Save</button>
          <button type="button" onClick={() => setRenaming(false)} className="h-8 px-2 text-xs text-[var(--muted-foreground)]">Cancel</button>
        </form>
      ) : (
        <h3 className={headingClass}>{section.name} <span>· {count}</span></h3>
      )}
      {canWrite && !renaming ? (
        <div className="flex gap-1 text-xs text-[var(--muted-foreground)]">
          <button type="button" onClick={() => setRenaming(true)} aria-label={`Rename section ${section.name}`} className="px-2 py-1 hover:text-[var(--foreground)]">Rename</button>
          <button type="button" disabled={remove.isPending} aria-label={`Delete section ${section.name}`}
            onClick={() => { if (window.confirm(`Delete the section “${section.name}”? Its tasks stay in the project, under No section.`)) remove.mutate(); }}
            className="px-2 py-1 hover:text-[var(--foreground)] disabled:opacity-50">Delete</button>
        </div>
      ) : null}
      {rename.isError || remove.isError ? (
        <p role="alert" className="w-full text-xs text-[var(--accent)]">{((rename.error ?? remove.error) as Error).message}</p>
      ) : null}
    </div>
  );
}

export function NoSectionHeader({ count }: { count: number }) {
  return <h3 className={`${headingClass} mb-2`}>No section <span>· {count}</span></h3>;
}

/** "Add section" below the list. */
export function AddSection({ projectId }: { projectId: string }) {
  const cache = useSectionCache(projectId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.createSection(projectId, name.trim()),
    onSuccess: ({ section }) => {
      cache.set((list) => [...list, section]);
      setName("");
      setOpen(false);
    },
  });
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
        + Add section
      </button>
    );
  }
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(); }}>
      <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus aria-label="New section name" placeholder="Section name"
        className="h-9 min-w-[12rem] rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 text-sm text-[var(--foreground)]" />
      <button type="submit" disabled={!name.trim() || create.isPending} className="h-9 rounded-lg bg-[var(--accent)] px-3 text-sm text-[var(--accent-ink)] disabled:opacity-50">
        {create.isPending ? "Adding…" : "Add section"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="h-9 px-2 text-sm text-[var(--muted-foreground)]">Cancel</button>
      {create.isError ? <p role="alert" className="w-full text-xs text-[var(--accent)]">{(create.error as Error).message}</p> : null}
    </form>
  );
}

/** A labelled "Section" picker; nothing at all while the project has no sections. */
export function SectionSelect({ projectId, value, onChange, disabled = false, className, labelClassName }: {
  projectId: string;
  value: string | null;
  onChange: (sectionId: string | null) => void;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
}) {
  const sections = useSections(projectId).data?.sections ?? [];
  if (!sections.length) return null;
  return (
    <label className={labelClassName}>
      <span>Section</span>
      {/* Named directly: as the label's whole text it would also take in the options. */}
      <select aria-label="Section" value={value ?? ""} disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)} className={className}>
        <option value="">No section</option>
        {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
      </select>
    </label>
  );
}
