import type { TaskPriority } from "@/src/core/models/enums";
import type { RecurrenceRule } from "@/src/core/sync/types";

/** One task to create, in order; `parent` points at an earlier task in the same plan. */
export type ImportTask = {
  title: string;
  description: string | null;
  priority: TaskPriority;
  dueAt: string | null;
  dueHasTime: boolean;
  recurrence: RecurrenceRule | null;
  done: boolean;
  tagNames: string[];
  sectionName: string | null;
  assigneeEmail: string | null;
  parent: number | null;
  comments: string[];
};

export type ImportPlan = { source: "todoist" | "csv"; tasks: ImportTask[]; sections: string[]; warnings: string[] };

/** A date string read into a due date; null when it can't be read. */
export type DateReader = (text: string) => { dueAt: string; dueHasTime: boolean; recurrence: RecurrenceRule | null } | null;

export const MAX_IMPORT_TASKS = 2000;

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes, CRLF or LF, an optional BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

const norm = (header: string) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Todoist's project export: TYPE, CONTENT, PRIORITY, INDENT … */
export function isTodoistCsv(header: string[]) {
  const names = header.map(norm);
  return names.includes("type") && names.includes("content") && names.includes("indent");
}

/** Todoist's p1 (most important) to p4, the same way quick add reads "p1". */
const TODOIST_PRIORITY: Record<string, TaskPriority> = { "1": "high", "2": "medium", "3": "low", "4": "none" };

/**
 * A Todoist CSV as a plan. Sections become sections, INDENT 2+ makes a
 * subtask of the task above it, notes become comments on the task above,
 * and @labels in a title become tags.
 */
export function planFromTodoist(rows: string[][], readDate: DateReader): ImportPlan {
  const [header = [], ...body] = rows;
  const col = (name: string) => header.map(norm).indexOf(name);
  const at = { type: col("type"), content: col("content"), description: col("description"), priority: col("priority"), indent: col("indent"), date: col("date"), responsible: col("responsible") };
  const cell = (row: string[], index: number) => (index >= 0 ? (row[index] ?? "").trim() : "");
  const tasks: ImportTask[] = [];
  const sections: string[] = [];
  const warnings: string[] = [];
  let section: string | null = null;
  // The latest task at each indent level, for parents.
  const stack: number[] = [];
  for (const row of body) {
    const type = cell(row, at.type).toLowerCase();
    const content = cell(row, at.content);
    if (type === "section") {
      section = content || null;
      if (section && !sections.includes(section)) sections.push(section);
      stack.length = 0;
      continue;
    }
    if (type === "note") {
      const last = tasks.at(-1);
      if (last && content) last.comments.push(content);
      continue;
    }
    if (type !== "task" || !content) continue;
    const tagNames = [...content.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu)].map((m) => m[1]!);
    const title = content.replace(/(?:^|\s)@[\p{L}\p{N}_-]+/gu, " ").replace(/\s+/g, " ").trim() || content;
    const indent = Math.max(1, Number.parseInt(cell(row, at.indent), 10) || 1);
    const dateText = cell(row, at.date);
    const date = dateText ? readDate(dateText) : null;
    if (dateText && !date) warnings.push(`Couldn't read the date “${dateText}” on “${title}”; it was left off.`);
    const responsible = cell(row, at.responsible);
    tasks.push({
      title: title.slice(0, 500),
      description: cell(row, at.description) || null,
      priority: TODOIST_PRIORITY[cell(row, at.priority)] ?? "none",
      dueAt: date?.dueAt ?? null,
      dueHasTime: date?.dueHasTime ?? false,
      recurrence: date?.recurrence ?? null,
      done: false,
      tagNames,
      sectionName: section,
      assigneeEmail: responsible.includes("@") ? responsible : null,
      parent: indent > 1 ? stack[indent - 2] ?? null : null,
      comments: [],
    });
    stack[indent - 1] = tasks.length - 1;
    stack.length = indent;
  }
  return { source: "todoist", tasks, sections, warnings };
}

/** The Flow fields a CSV column can fill. */
export const IMPORT_FIELDS = ["title", "description", "due", "priority", "status", "tags", "section", "assignee"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type ColumnMapping = Partial<Record<ImportField, number>>;

export const IMPORT_FIELD_LABEL: Record<ImportField, string> = {
  title: "Title", description: "Description", due: "Due date", priority: "Priority",
  status: "Status", tags: "Tags", section: "Section", assignee: "Assignee email",
};

const GUESSES: Record<ImportField, string[]> = {
  title: ["title", "name", "task", "content", "summary", "subject"],
  description: ["description", "notes", "note", "details", "body"],
  due: ["due", "due date", "date", "deadline", "due on"],
  priority: ["priority", "importance"],
  status: ["status", "state", "done", "completed"],
  tags: ["tags", "labels", "label", "tag"],
  section: ["section", "list", "column", "group", "category"],
  assignee: ["assignee", "assigned to", "owner", "responsible", "email"],
};

/** A first guess at which column is which, from the header names. */
export function guessMapping(header: string[]): ColumnMapping {
  const names = header.map(norm);
  const mapping: ColumnMapping = {};
  for (const field of IMPORT_FIELDS) {
    const index = names.findIndex((name, i) => GUESSES[field].includes(name) && !Object.values(mapping).includes(i));
    if (index >= 0) mapping[field] = index;
  }
  return mapping;
}

function readPriority(text: string): TaskPriority {
  const value = text.trim().toLowerCase();
  if (["urgent", "critical", "highest", "p0"].includes(value)) return "urgent";
  if (["high", "p1", "1"].includes(value)) return "high";
  if (["medium", "normal", "p2", "2"].includes(value)) return "medium";
  if (["low", "p3", "3", "lowest"].includes(value)) return "low";
  return "none";
}

const DONE = new Set(["done", "completed", "complete", "closed", "finished", "yes", "true", "x", "1"]);

/** Any CSV, read through a column mapping. Rows without a title are skipped. */
export function planFromCsv(rows: string[][], mapping: ColumnMapping, readDate: DateReader): ImportPlan {
  const [, ...body] = rows;
  const cell = (row: string[], field: ImportField) => (mapping[field] !== undefined ? (row[mapping[field]!] ?? "").trim() : "");
  const tasks: ImportTask[] = [];
  const sections: string[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  for (const row of body) {
    const title = cell(row, "title");
    if (!title) { skipped += 1; continue; }
    const dateText = cell(row, "due");
    const date = dateText ? readDate(dateText) : null;
    if (dateText && !date) warnings.push(`Couldn't read the date “${dateText}” on “${title}”; it was left off.`);
    const section = cell(row, "section") || null;
    if (section && !sections.includes(section)) sections.push(section);
    const assignee = cell(row, "assignee");
    tasks.push({
      title: title.slice(0, 500),
      description: cell(row, "description") || null,
      priority: readPriority(cell(row, "priority")),
      dueAt: date?.dueAt ?? null,
      dueHasTime: date?.dueHasTime ?? false,
      recurrence: date?.recurrence ?? null,
      done: DONE.has(cell(row, "status").toLowerCase()),
      tagNames: cell(row, "tags").split(/[,;|]/).map((tag) => tag.trim().replace(/^[#@]/, "")).filter(Boolean),
      sectionName: section,
      assigneeEmail: assignee.includes("@") ? assignee : null,
      parent: null,
      comments: [],
    });
  }
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? "" : "s"} without a title ${skipped === 1 ? "was" : "were"} skipped.`);
  return { source: "csv", tasks, sections, warnings };
}
