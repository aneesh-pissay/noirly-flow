"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import {
  IMPORT_FIELDS, IMPORT_FIELD_LABEL, MAX_IMPORT_TASKS, guessMapping, isTodoistCsv, parseCsv, planFromCsv, planFromTodoist,
  type ColumnMapping, type DateReader, type ImportField,
} from "@/src/core/import";
import { parseQuickAdd } from "@/src/features/task/quick-add";
import { dueInputToIso } from "@/src/features/task/dates";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const fieldClass = "h-9 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-sm text-[var(--foreground)]";

/**
 * Dates as people write them: anything quick add understands ("tomorrow",
 * "every monday", "Oct 24 3pm"), an ISO date, or something the browser can parse.
 * All-day dates land at local noon, like dates picked in the app.
 */
const readDate: DateReader = (text) => {
  const value = text.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(value);
  if (iso) {
    const dueAt = dueInputToIso(iso[1]!, iso[2] ?? "");
    return dueAt ? { dueAt, dueHasTime: Boolean(iso[2]), recurrence: null } : null;
  }
  const quick = parseQuickAdd(value, { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (quick.dueDate) {
    const dueAt = dueInputToIso(quick.dueDate, quick.dueTime ?? "");
    if (dueAt) return { dueAt, dueHasTime: Boolean(quick.dueTime), recurrence: quick.recurrence ?? null };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || !/\d/.test(value)) return null;
  const day = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  const dueAt = dueInputToIso(day, "");
  return dueAt ? { dueAt, dueHasTime: false, recurrence: null } : null;
};

/** Workspace settings → Data → Import: a Todoist export or any CSV into a project. */
export function ImportSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const projects = useQuery({ queryKey: qk.projects(workspaceId), queryFn: () => api.listProjects(workspaceId) }).data?.projects
    .filter((p) => !p.archivedAt) ?? [];
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const target = projectId || projects[0]?.id || "";

  const todoist = file ? isTodoistCsv(file.rows[0] ?? []) : false;
  const plan = useMemo(() => {
    if (!file) return null;
    return todoist ? planFromTodoist(file.rows, readDate) : planFromCsv(file.rows, mapping, readDate);
  }, [file, todoist, mapping]);

  const run = useMutation({
    mutationFn: () => api.importTasks(target, plan!.tasks),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] }),
  });

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    setFileError(null);
    run.reset();
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) { setFileError("That file is over 5 MB."); return; }
    const rows = parseCsv(await chosen.text());
    if (rows.length < 2) { setFileError("That file has no rows to import."); setFile(null); return; }
    setFile({ name: chosen.name, rows });
    setMapping(guessMapping(rows[0]!));
  }

  const header = file?.rows[0] ?? [];
  const tooMany = (plan?.tasks.length ?? 0) > MAX_IMPORT_TASKS;
  const subtasks = plan?.tasks.filter((t) => t.parent !== null).length ?? 0;
  const comments = plan?.tasks.reduce((sum, t) => sum + t.comments.length, 0) ?? 0;
  const result = run.data;

  return (
    <div className="mt-5 border-t border-[var(--hairline)] pt-4">
      <h3 className="text-sm font-medium text-[var(--foreground)]">Import</h3>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Bring tasks in from a CSV file: a Todoist project export (sections, subtasks, notes and labels come across), or any
        spreadsheet saved as CSV. Up to {MAX_IMPORT_TASKS} tasks at a time. Automations don&apos;t run on imported tasks.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
          Into project
          <select value={target} onChange={(event) => setProjectId(event.target.value)} className={fieldClass} aria-label="Import into project">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
          CSV file
          <input type="file" accept=".csv,text/csv" onChange={(event) => void choose(event)} aria-label="CSV file to import"
            className="text-sm text-[var(--foreground)] file:mr-3 file:rounded-lg file:border file:border-[var(--hairline)] file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--foreground)]" />
        </label>
      </div>
      {fileError ? <p role="alert" className="mt-2 text-sm text-[var(--accent)]">{fileError}</p> : null}

      {file && plan ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-[var(--foreground)]">
            {todoist ? "Todoist export" : "CSV"} · <span className="font-mono text-xs">{file.name}</span>
          </p>
          {!todoist ? (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-xs text-[var(--muted-foreground)]">Which column is which</legend>
              {IMPORT_FIELDS.map((field: ImportField) => (
                <label key={field} className="flex items-center justify-between gap-2 text-sm text-[var(--foreground)]">
                  {IMPORT_FIELD_LABEL[field]}{field === "title" ? " *" : ""}
                  <select aria-label={`Column for ${IMPORT_FIELD_LABEL[field]}`} value={mapping[field] ?? ""} className={`${fieldClass} w-44`}
                    onChange={(event) => setMapping((old) => {
                      const next = { ...old };
                      if (event.target.value === "") delete next[field];
                      else next[field] = Number(event.target.value);
                      return next;
                    })}>
                    <option value="">Not used</option>
                    {header.map((name, index) => <option key={index} value={index}>{name || `Column ${index + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </fieldset>
          ) : null}
          <p className="text-sm text-[var(--muted-foreground)]" aria-live="polite">
            {plan.tasks.length} task{plan.tasks.length === 1 ? "" : "s"}
            {subtasks ? `, ${subtasks} of them subtasks` : ""}
            {plan.sections.length ? ` · ${plan.sections.length} section${plan.sections.length === 1 ? "" : "s"}` : ""}
            {comments ? ` · ${comments} note${comments === 1 ? "" : "s"} as comments` : ""}
          </p>
          {plan.tasks.length ? (
            <ul aria-label="Import preview" className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)] text-sm">
              {plan.tasks.slice(0, 5).map((task, index) => (
                <li key={index} className="flex flex-wrap gap-x-3 py-1.5">
                  <span className={`${task.parent !== null ? "pl-4" : ""} text-[var(--foreground)]`}>{task.title}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {[task.sectionName, task.priority !== "none" ? task.priority : null, task.dueAt ? new Date(task.dueAt).toLocaleDateString() : null, task.recurrence ? "repeats" : null, task.done ? "done" : null, ...task.tagNames.map((t) => `#${t}`)]
                      .filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {plan.warnings.length ? (
            <ul className="list-disc pl-5 text-xs text-[var(--muted-foreground)]">
              {plan.warnings.slice(0, 5).map((warning) => <li key={warning}>{warning}</li>)}
              {plan.warnings.length > 5 ? <li>…and {plan.warnings.length - 5} more.</li> : null}
            </ul>
          ) : null}
          {tooMany ? <p role="alert" className="text-sm text-[var(--accent)]">That&apos;s more than {MAX_IMPORT_TASKS} tasks; split the file and import it in parts.</p> : null}
          {run.isError ? <p role="alert" className="text-sm text-[var(--accent)]">{run.error.message}</p> : null}
          {result ? (
            <div role="status" className="text-sm text-[var(--foreground)]">
              Imported {result.created} task{result.created === 1 ? "" : "s"}
              {result.sectionsCreated ? `, ${result.sectionsCreated} new section${result.sectionsCreated === 1 ? "" : "s"}` : ""}
              {result.tagsCreated ? `, ${result.tagsCreated} new tag${result.tagsCreated === 1 ? "" : "s"}` : ""}.{" "}
              <Link href={`/w/${workspaceId}/p/${target}`} className="underline">Open the project</Link>
              {result.failed.length ? <p className="mt-1 text-[var(--accent)]">{result.failed.length} couldn&apos;t be created: {result.failed.slice(0, 3).map((f) => `“${f.title}” (${f.error})`).join(", ")}</p> : null}
              {result.unknownAssignees.length ? <p className="mt-1 text-xs text-[var(--muted-foreground)]">Not members here, left unassigned: {result.unknownAssignees.join(", ")}</p> : null}
            </div>
          ) : (
            <Button type="button" className="self-start" disabled={!target || !plan.tasks.length || tooMany || run.isPending} onClick={() => run.mutate()}>
              {run.isPending ? "Importing…" : `Import ${plan.tasks.length} task${plan.tasks.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
