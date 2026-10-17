"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { countTemplateTasks, type Template } from "@/src/core/templates";

export function useTemplates(workspaceId: string) {
  return useQuery({ queryKey: qk.templates(workspaceId), queryFn: () => api.listTemplates(workspaceId), staleTime: 60_000 });
}

/** "Every task in it", for showing what a template will make. */
export function templateSize(template: Template) {
  return template.kind === "task"
    ? countTemplateTasks([template.data.task])
    : countTemplateTasks(template.data.tasks);
}

/** "Save as template" for a task (with its open subtasks) or a project (sections and open tasks). */
export function SaveAsTemplateButton({ workspaceId, source, defaultName, className }: {
  workspaceId: string;
  source: { kind: "task"; taskId: string } | { kind: "project"; projectId: string };
  defaultName: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (name: string) => api.saveTemplate(workspaceId, { ...source, name } as Parameters<typeof api.saveTemplate>[1]),
    onSuccess: ({ template }) => {
      void queryClient.invalidateQueries({ queryKey: qk.templates(workspaceId) });
      setMessage(`Saved “${template.name}”`);
    },
    onError: (err: Error) => setMessage(err.message),
  });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={save.isPending} className={className}
        onClick={() => {
          const name = window.prompt("Template name", defaultName)?.trim();
          if (name) save.mutate(name.slice(0, 80));
        }}>
        {save.isPending ? "Saving…" : "Save as template"}
      </button>
      {message ? <span role="status" className="text-xs text-[var(--muted-foreground)]">{message}</span> : null}
    </span>
  );
}

/** Workspace settings: the workspace's templates, with delete. */
export function TemplateManager({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const templates = useTemplates(workspaceId).data?.templates ?? [];
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteTemplate(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: qk.templates(workspaceId) }),
  });
  if (!templates.length) {
    return <p className="mt-3 text-sm text-[var(--muted-foreground)]">No templates yet. Save one from a task&apos;s drawer, or a project&apos;s edit menu in the sidebar.</p>;
  }
  return (
    <ul className="mt-4 divide-y divide-[var(--hairline)]">
      {templates.map((template) => (
        <li key={template.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="text-sm text-[var(--foreground)]">
            {template.name}{" "}
            <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              {template.kind} · {templateSize(template)} task{templateSize(template) === 1 ? "" : "s"}
              {template.kind === "project" && template.data.sections.length ? ` · ${template.data.sections.length} sections` : ""}
            </span>
          </span>
          {canEdit ? (
            <button type="button" disabled={remove.isPending} aria-label={`Delete template ${template.name}`}
              onClick={() => { if (window.confirm(`Delete the template “${template.name}”? Nothing made from it changes.`)) remove.mutate(template.id); }}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50">
              Delete
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
