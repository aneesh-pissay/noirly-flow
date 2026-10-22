import type { Task } from "@/src/core/sync/types";
import type { ProjectField } from "@/src/core/custom-fields";
import { formatFieldValue } from "@/src/core/custom-fields";
import type { StatusNames } from "@/src/core/workspace-settings";

export const EXPORT_FORMAT = "noirly-flow-export";
export const EXPORT_VERSION = 1;
/** Above this many tasks an export is refused rather than built in one go. */
export const MAX_EXPORT_TASKS = 50_000;

/**
 * One CSV cell. Quotes when needed, and defuses text a spreadsheet would run
 * as a formula (=, +, -, @, tab, return at the start), which is how a task
 * title could otherwise attack whoever opens the file.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvRow(cells: Array<string | number | null | undefined>) {
  return cells.map(csvCell).join(",");
}

/** A local calendar day for an all-day date, or the full instant for a timed one. */
function dateCell(iso: string | null, timed: boolean) {
  if (!iso) return "";
  return timed ? iso : iso.slice(0, 10);
}

export type CsvContext = {
  projects: Map<string, string>;
  sections: Map<string, string>;
  tags: Map<string, string>;
  people: Map<string, string>;
  goals: Map<string, string>;
  statusNames: StatusNames;
  /** Every project's custom fields; each distinct field name gets a column. */
  fields: ProjectField[];
};

/** Tasks as a spreadsheet: one row each, people and tags by name, a column per custom field. */
export function tasksToCsv(tasks: Task[], context: CsvContext) {
  const fieldNames = [...new Set(context.fields.map((field) => field.name))].sort((a, b) => a.localeCompare(b));
  const fieldsById = new Map(context.fields.map((field) => [field.id, field]));
  const header = [
    "ID", "Title", "Project", "Section", "Status", "Priority", "Due", "Start", "Deadline", "Estimate (min)",
    "Assignees", "Tags", "Goal", "Parent task ID", "Created", "Completed", "Description",
    ...fieldNames.map((name) => `Field: ${name}`),
  ];
  const lines = [csvRow(header)];
  for (const task of tasks) {
    const fieldCells = new Map<string, string>();
    for (const [fieldId, value] of Object.entries(task.fieldValues ?? {})) {
      const field = fieldsById.get(fieldId);
      if (field) fieldCells.set(field.name, formatFieldValue(field, value, context.people) ?? "");
    }
    lines.push(csvRow([
      task.id,
      task.title,
      task.projectId ? context.projects.get(task.projectId) ?? "" : "Inbox",
      task.sectionId ? context.sections.get(task.sectionId) ?? "" : "",
      context.statusNames[task.status],
      task.priority,
      dateCell(task.dueAt, task.dueHasTime),
      dateCell(task.startAt, false),
      dateCell(task.deadlineAt, false),
      task.durationMinutes,
      task.assigneeIds.map((id) => context.people.get(id) ?? "Former member").join("; "),
      task.tagIds.map((id) => context.tags.get(id)).filter(Boolean).join("; "),
      task.goalId ? context.goals.get(task.goalId) ?? "" : "",
      task.parentTaskId,
      task.createdAt,
      task.completedAt,
      task.description,
      ...fieldNames.map((name) => fieldCells.get(name) ?? ""),
    ]));
  }
  // A byte-order mark so Excel reads it as UTF-8.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** "Team Alpha" → "team-alpha", for file names. */
export function fileSlug(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
}
