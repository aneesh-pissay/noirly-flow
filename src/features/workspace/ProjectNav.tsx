"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, Star } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button, Dialog, Input, cn } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Project, Workspace } from "@/src/core/sync/types";
import type { MemberRole } from "@/src/core/models/enums";
import { useCan } from "@/src/features/workspace/WorkspaceRoleContext";
import { NavLink, useOptimisticPath } from "@/src/components/NavLink";
import { useUIStore } from "@/src/stores/ui-store";
import { TAG_COLORS } from "@/src/features/tags/tags";

type WorkspacePayload = {
  workspace: Workspace & { role: MemberRole };
  projects: Project[];
};

type Props = {
  workspaceId: string;
};

function navClass(active: boolean) {
  return cn(
    "block cursor-pointer truncate rounded-xl px-3 py-2 text-sm transition-colors",
    active
      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
      : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
  );
}

export function ProjectNav({ workspaceId }: Props) {
  const path = useOptimisticPath();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  const workspaceQuery = useQuery({
    queryKey: qk.workspace(workspaceId),
    queryFn: () => api.getWorkspace(workspaceId),
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createProject(workspaceId, { name }),
    onSuccess: (result) => {
      setName("");
      setOpen(false);
      queryClient.setQueryData<WorkspacePayload>(
        qk.workspace(workspaceId),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            projects: [...old.projects, result.project],
          };
        },
      );
      queryClient.setQueryData<{ projects: Project[] }>(
        qk.projects(workspaceId),
        (old) => ({
          projects: [...(old?.projects ?? []), result.project],
        }),
      );
      const href = `/w/${workspaceId}/p/${result.project.id}`;
      useUIStore.getState().setPendingHref(href);
      router.push(href);
    },
  });

  const allProjects = workspaceQuery.data?.projects ?? [];
  const projects = allProjects.filter((project) => !project.archivedAt);
  const archived = allProjects.filter((project) => project.archivedAt);
  const [showArchived, setShowArchived] = useState(false);
  const favoritesQuery = useQuery({ queryKey: qk.favoriteProjects, queryFn: () => api.listFavoriteProjects(), staleTime: 60_000 });
  const favoriteIds = new Set(favoritesQuery.data?.projectIds ?? []);
  const favorites = projects.filter((project) => favoriteIds.has(project.id));
  const favoriteMutation = useMutation({
    mutationFn: ({ projectId, favorite }: { projectId: string; favorite: boolean }) => api.setFavoriteProject(projectId, favorite),
    onSuccess: (result) => queryClient.setQueryData(qk.favoriteProjects, result),
  });
  const toggleFavorite = (projectId: string) =>
    favoriteMutation.mutate({ projectId, favorite: !favoriteIds.has(projectId) });
  const canWrite = useCan("project.write");
  const canDelete = useCan("project.delete");
  const inboxHref = `/w/${workspaceId}/inbox`;
  const inboxActive = path.includes("/inbox");
  const activeProjectId = path.includes("/p/")
    ? path.split("/p/")[1]?.split("/")[0]
    : null;

  return (
    <section>
      <div className="flex items-center justify-between px-2 pb-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Projects
        </p>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="cursor-pointer text-xs text-[var(--foreground)] hover:underline"
          >
            {open ? "Cancel" : "New"}
          </button>
        ) : null}
      </div>
      {open && canWrite ? (
        <form
          className="mb-2 flex gap-2 px-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            createMutation.mutate();
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Project name"
            className="h-8 flex-1 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            disabled={createMutation.isPending || !name.trim()}
          >
            {createMutation.isPending ? "Saving…" : "Add"}
          </Button>
        </form>
      ) : null}
      {favorites.length ? (
        <>
          <p className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Favourites</p>
          <ul className="mb-4 flex flex-col gap-1" aria-label="Favourite projects">
            {favorites.map((project) => (
              <li key={project.id}>
                <NavLink href={`/w/${workspaceId}/p/${project.id}`} className={navClass(activeProjectId === project.id)}>
                  <ProjectDot color={project.color} />{project.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <ul className="flex flex-col gap-1">
        <li>
          <NavLink href={`/w/${workspaceId}/today`} className={navClass(path.endsWith("/today"))}>
            Today
          </NavLink>
        </li>
        <li>
          <NavLink href={`/w/${workspaceId}/upcoming`} className={navClass(path.endsWith("/upcoming"))}>
            Upcoming
          </NavLink>
        </li>
        <li>
          <NavLink href={inboxHref} className={navClass(inboxActive)}>
            Inbox
          </NavLink>
        </li>
        {projects.map((project) => {
          const href = `/w/${workspaceId}/p/${project.id}`;
          const active = activeProjectId === project.id;
          return (
            <ProjectItem
              key={project.id}
              workspaceId={workspaceId}
              project={project}
              href={href}
              active={active}
              canWrite={canWrite}
              canDelete={canDelete}
              favorite={favoriteIds.has(project.id)}
              onToggleFavorite={() => toggleFavorite(project.id)}
            />
          );
        })}
        {workspaceQuery.isLoading && projects.length === 0 ? (
          <li className="px-3 py-2 text-xs text-[var(--muted-foreground)]">
            Loading…
          </li>
        ) : null}
      </ul>
      {archived.length ? (
        <div className="mt-2">
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived((value) => !value)}
            className="px-3 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            {showArchived ? "Hide archived" : `Archived (${archived.length})`}
          </button>
          {showArchived ? (
            <ul className="flex flex-col gap-1" aria-label="Archived projects">
              {archived.map((project) => (
                <ArchivedProjectItem key={project.id} workspaceId={workspaceId} project={project}
                  active={activeProjectId === project.id} canWrite={canWrite} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {createMutation.isError ? (
        <p className="px-2 pt-2 text-xs text-[var(--foreground)]">
          {(createMutation.error as Error).message}
        </p>
      ) : null}
    </section>
  );
}

/** A project's colour as a small dot before its name; nothing when it has none. */
export function ProjectDot({ color }: { color: string | null }) {
  if (!color) return null;
  return <span aria-hidden className="mr-2 inline-block size-2 rounded-full align-middle" style={{ backgroundColor: color }} />;
}

/** Patches a project in the workspace and project-list caches. */
function useProjectCaches(workspaceId: string) {
  const queryClient = useQueryClient();
  return (update: (projects: Project[]) => Project[]) => {
    queryClient.setQueryData<WorkspacePayload>(qk.workspace(workspaceId), (old) =>
      old ? { ...old, projects: update(old.projects) } : old,
    );
    queryClient.setQueryData<{ projects: Project[] }>(qk.projects(workspaceId), (old) =>
      old ? { projects: update(old.projects) } : old,
    );
  };
}

function ArchivedProjectItem({ workspaceId, project, active, canWrite }: {
  workspaceId: string;
  project: Project;
  active: boolean;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const patchCaches = useProjectCaches(workspaceId);
  const unarchive = useMutation({
    mutationFn: () => api.updateProject(project.id, { archived: false }),
    onSuccess: (result) => {
      patchCaches((list) => list.map((p) => (p.id === project.id ? result.project : p)));
      void queryClient.invalidateQueries({ queryKey: qk.project(project.id) });
      void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
    },
  });
  return (
    <li className="flex items-center gap-1">
      <NavLink href={`/w/${workspaceId}/p/${project.id}`} className={cn(navClass(active), "min-w-0 flex-1 opacity-70")}>
        <ProjectDot color={project.color} />{project.name}
      </NavLink>
      {canWrite ? (
        <button type="button" disabled={unarchive.isPending} onClick={() => unarchive.mutate()}
          aria-label={`Unarchive ${project.name}`}
          className="shrink-0 px-2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50">
          Unarchive
        </button>
      ) : null}
    </li>
  );
}

function ProjectItem({
  workspaceId,
  project,
  href,
  active,
  canWrite,
  canDelete,
  favorite,
  onToggleFavorite,
}: {
  workspaceId: string;
  project: Project;
  href: string;
  active: boolean;
  canWrite: boolean;
  canDelete: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(project.name);

  const patchCaches = useProjectCaches(workspaceId);

  const appearanceMutation = useMutation({
    mutationFn: (patch: { color?: string | null; archived?: boolean }) => api.updateProject(project.id, patch),
    onSuccess: (result, patch) => {
      patchCaches((list) => list.map((p) => (p.id === project.id ? result.project : p)));
      void queryClient.invalidateQueries({ queryKey: qk.project(project.id) });
      if (patch.archived !== undefined) {
        setEditing(false);
        // Its tasks leave (or rejoin) Today, Upcoming and filters.
        void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      }
    },
  });

  const renameMutation = useMutation({
    mutationFn: () => api.updateProject(project.id, { name: name.trim() }),
    onSuccess: (result) => {
      setEditing(false);
      patchCaches((list) => list.map((p) => (p.id === project.id ? result.project : p)));
      void queryClient.invalidateQueries({ queryKey: qk.project(project.id) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: () => {
      setConfirmDelete(false);
      setEditing(false);
      patchCaches((list) => list.filter((p) => p.id !== project.id));
      queryClient.removeQueries({ queryKey: qk.project(project.id) });
      // Its tasks went with it; drop them from search, inbox and calendar.
      void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      if (active) router.replace(`/w/${workspaceId}`);
    },
  });

  if (editing) {
    return (
      <li>
        <form
          className="flex flex-col gap-2 rounded-xl border border-[var(--hairline)] p-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || name.trim() === project.name) {
              setEditing(false);
              return;
            }
            renameMutation.mutate();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditing(false);
            }}
            aria-label="Project name"
            className="h-8 text-xs"
          />
          <div role="radiogroup" aria-label="Project colour" className="flex flex-wrap gap-1">
            <button type="button" role="radio" aria-checked={!project.color} aria-label="No colour" title="No colour"
              onClick={() => appearanceMutation.mutate({ color: null })}
              className={cn("size-5 rounded-full border-2 border-dashed border-[var(--hairline)]", !project.color && "border-[var(--foreground)]")} />
            {TAG_COLORS.map((color) => (
              <button key={color.value} type="button" role="radio" aria-checked={project.color?.toLowerCase() === color.value.toLowerCase()}
                aria-label={color.name} title={color.name}
                onClick={() => appearanceMutation.mutate({ color: color.value })}
                className={cn("size-5 rounded-full border-2 border-transparent", project.color?.toLowerCase() === color.value.toLowerCase() && "border-[var(--foreground)]")}
                style={{ backgroundColor: color.value }} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={renameMutation.isPending || !name.trim()}>
              {renameMutation.isPending ? "Saving…" : "Save"}
            </Button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="cursor-pointer text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={appearanceMutation.isPending}
              onClick={() => appearanceMutation.mutate({ archived: true })}
              className="cursor-pointer text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50"
            >
              Archive
            </button>
            {canDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="ml-auto cursor-pointer text-xs text-red-600 hover:underline dark:text-red-400"
              >
                Delete
              </button>
            ) : null}
          </div>
          {renameMutation.isError || appearanceMutation.isError ? (
            <p className="text-xs text-[var(--foreground)]">
              {((renameMutation.error ?? appearanceMutation.error) as Error).message}
            </p>
          ) : null}
        </form>
        {/* Portaled out of <main>'s stacking context so it covers the header. */}
        {createPortal(
        <Dialog
          open={confirmDelete}
          title="Delete project?"
          onClose={() => setConfirmDelete(false)}
        >
          <p className="text-sm text-[var(--muted-foreground)]">
            “{project.name}” and all of its tasks will be removed for everyone in this
            workspace.
          </p>
          {deleteMutation.isError ? (
            <p className="mt-3 text-sm text-[var(--foreground)]">
              {(deleteMutation.error as Error).message}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete project"}
            </Button>
          </div>
        </Dialog>,
          document.body,
        )}
      </li>
    );
  }

  return (
    <li className="group relative">
      <NavLink href={href} className={cn(navClass(active), canWrite ? "pr-16" : "pr-9")}>
        <ProjectDot color={project.color} />{project.name}
      </NavLink>
      <button
        type="button"
        aria-label={favorite ? `Remove ${project.name} from favourites` : `Add ${project.name} to favourites`}
        aria-pressed={favorite}
        title={favorite ? "Unfavourite" : "Favourite"}
        onClick={onToggleFavorite}
        className={cn(
          "absolute top-1/2 inline-flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--surface-2)] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
          canWrite ? "right-8" : "right-1.5",
          favorite ? "text-[var(--accent)] opacity-100" : "text-[var(--muted-foreground)] opacity-0",
        )}
      >
        <Star size={12} aria-hidden fill={favorite ? "currentColor" : "none"} />
      </button>
      {canWrite ? (
        <button
          type="button"
          aria-label={`Edit ${project.name}`}
          title="Rename, colour, archive or delete"
          onClick={() => {
            setName(project.name);
            setEditing(true);
          }}
          className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-[var(--muted-foreground)] opacity-0 transition-opacity hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <Pencil size={12} aria-hidden />
        </button>
      ) : null}
    </li>
  );
}
