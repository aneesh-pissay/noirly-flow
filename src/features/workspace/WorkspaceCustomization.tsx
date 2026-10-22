"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, cn } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { Workspace } from "@/src/core/sync/types";
import { TASK_STATUSES, type TaskStatus } from "@/src/core/models/enums";
import { DEFAULT_STATUS_NAMES, OPEN_VIEWS, OPEN_VIEW_LABEL, checkStatusNames, isWorkspaceIcon } from "@/src/core/workspace-settings";
import { TAG_COLORS } from "@/src/features/tags/tags";
import { WorkspaceIcon } from "@/src/features/workspace/workspace-look";

const sectionClass = "border border-[var(--hairline)] bg-[var(--surface)] p-5 scroll-mt-6";
const kickerClass = "font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]";
const SUGGESTED = ["🚀", "🧭", "🛠️", "📈", "🎯", "💡", "🧪", "📦", "🏠", "🎨", "📚", "🌱", "⚡", "🔥", "🌊", "🪐"];

/** Appearance, defaults and status names for a workspace (admins edit, everyone sees). */
export function WorkspaceCustomization({ workspace, canEdit }: { workspace: Workspace; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof api.customizeWorkspace>[1]) => api.customizeWorkspace(workspace.id, patch),
    onMutate: () => { setError(null); setSaved(null); },
    onSuccess: (result, patch) => {
      queryClient.setQueryData<{ workspaces: Workspace[] }>(qk.workspaces, (old) =>
        old ? { workspaces: old.workspaces.map((w) => (w.id === workspace.id ? { ...w, ...result.workspace } : w)) } : old);
      void queryClient.invalidateQueries({ queryKey: qk.workspace(workspace.id) });
      setSaved(Object.keys(patch)[0] ?? null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const [customIcon, setCustomIcon] = useState("");
  const [names, setNames] = useState<Record<TaskStatus, string>>(() =>
    Object.fromEntries(TASK_STATUSES.map((s) => [s, workspace.statusNames[s] === DEFAULT_STATUS_NAMES[s] ? "" : workspace.statusNames[s]])) as Record<TaskStatus, string>);
  const nameProblem = checkStatusNames(names);
  const savedNote = (key: string) => (saved === key && !save.isPending ? <span className="ml-2 font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">Saved</span> : null);

  function submitNames(event: FormEvent) {
    event.preventDefault();
    if (!nameProblem) save.mutate({ statusNames: Object.fromEntries(TASK_STATUSES.map((s) => [s, names[s].trim() || null])) });
  }

  return (
    <>
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}

      <section id="appearance" aria-labelledby="appearance-title" className={sectionClass}>
        <p className={kickerClass}>Appearance</p>
        <h2 id="appearance-title" className="mt-1 text-sm font-medium text-[var(--foreground)]">Icon and colour{savedNote("icon")}{savedNote("color")}</h2>
        <div className="mt-4 flex items-center gap-3">
          <WorkspaceIcon workspace={workspace} size="lg" />
          <p className="text-sm text-[var(--muted-foreground)]">Shown next to the name in the sidebar. Without an emoji, the first letter is used.</p>
        </div>
        {canEdit ? (
          <div className="mt-4 flex flex-col gap-3">
            <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1.5">
              <button type="button" role="radio" aria-checked={!workspace.icon} aria-label="No icon" disabled={save.isPending}
                onClick={() => save.mutate({ icon: null })}
                className={cn("grid size-9 place-items-center rounded-lg border text-xs text-[var(--muted-foreground)]", !workspace.icon ? "border-[var(--foreground)]" : "border-[var(--hairline)]")}>
                Aa
              </button>
              {SUGGESTED.map((emoji) => (
                <button key={emoji} type="button" role="radio" aria-checked={workspace.icon === emoji} aria-label={`Icon ${emoji}`} disabled={save.isPending}
                  onClick={() => save.mutate({ icon: emoji })}
                  className={cn("grid size-9 place-items-center rounded-lg border text-lg", workspace.icon === emoji ? "border-[var(--foreground)]" : "border-[var(--hairline)]")}>
                  {emoji}
                </button>
              ))}
            </div>
            <form className="flex items-end gap-2" onSubmit={(event) => {
              event.preventDefault();
              if (isWorkspaceIcon(customIcon.trim())) save.mutate({ icon: customIcon.trim() }, { onSuccess: () => setCustomIcon("") });
            }}>
              <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
                Or any emoji
                <input value={customIcon} onChange={(event) => setCustomIcon(event.target.value)} maxLength={16} aria-invalid={Boolean(customIcon.trim()) && !isWorkspaceIcon(customIcon.trim())}
                  className="h-9 w-24 rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 text-center text-lg aria-[invalid=true]:border-[var(--accent)]" />
              </label>
              <Button type="submit" variant="secondary" disabled={!isWorkspaceIcon(customIcon.trim()) || save.isPending}>Use it</Button>
            </form>
            <div role="radiogroup" aria-label="Colour" className="flex flex-wrap items-center gap-2">
              <button type="button" role="radio" aria-checked={!workspace.color} aria-label="No colour" disabled={save.isPending}
                onClick={() => save.mutate({ color: null })}
                className={cn("size-6 rounded-full border-2 border-dashed border-[var(--hairline)]", !workspace.color && "border-[var(--foreground)]")} />
              {TAG_COLORS.map((color) => (
                <button key={color.value} type="button" role="radio" aria-checked={workspace.color?.toLowerCase() === color.value.toLowerCase()}
                  aria-label={color.name} title={color.name} disabled={save.isPending}
                  onClick={() => save.mutate({ color: color.value })}
                  className={cn("size-6 rounded-full border-2", workspace.color?.toLowerCase() === color.value.toLowerCase() ? "border-[var(--foreground)]" : "border-transparent")}
                  style={{ backgroundColor: color.value }} />
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section id="defaults" aria-labelledby="defaults-title" className={sectionClass}>
        <p className={kickerClass}>Defaults</p>
        <h2 id="defaults-title" className="mt-1 text-sm font-medium text-[var(--foreground)]">View for new projects{savedNote("defaultView")}</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          New projects open in this view. Each project can change its own with “Make default” next to its view buttons.
        </p>
        <select aria-label="Default view for new projects" value={workspace.defaultView} disabled={!canEdit || save.isPending}
          onChange={(event) => save.mutate({ defaultView: event.target.value as Workspace["defaultView"] })}
          className="mt-3 h-10 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-sm text-[var(--foreground)] disabled:opacity-60">
          {OPEN_VIEWS.map((view) => <option key={view} value={view}>{OPEN_VIEW_LABEL[view]}</option>)}
        </select>
      </section>

      <section id="statuses" aria-labelledby="statuses-title" className={sectionClass}>
        <p className={kickerClass}>Statuses</p>
        <h2 id="statuses-title" className="mt-1 text-sm font-medium text-[var(--foreground)]">Status names{savedNote("statusNames")}</h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Rename the four statuses for everyone in this workspace. Leave one blank to keep its usual name. Board columns can still
          add more stages per project.
        </p>
        <form onSubmit={submitNames} className="mt-3 grid gap-3 sm:grid-cols-2">
          {TASK_STATUSES.map((status) => (
            <label key={status} className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
              {DEFAULT_STATUS_NAMES[status]}
              <input value={names[status]} placeholder={DEFAULT_STATUS_NAMES[status]} maxLength={24} disabled={!canEdit}
                aria-label={`Name for ${DEFAULT_STATUS_NAMES[status]}`}
                onChange={(event) => setNames((old) => ({ ...old, [status]: event.target.value }))}
                className="h-10 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-sm text-[var(--foreground)] disabled:opacity-60" />
            </label>
          ))}
          {nameProblem ? <p role="alert" className="text-sm text-[var(--accent)] sm:col-span-2">{nameProblem}</p> : null}
          {canEdit ? (
            <div className="sm:col-span-2">
              <Button type="submit" disabled={Boolean(nameProblem) || save.isPending}>{save.isPending ? "Saving…" : "Save names"}</Button>
            </div>
          ) : null}
        </form>
      </section>
    </>
  );
}
