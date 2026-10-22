import { TASK_STATUSES, type TaskStatus } from "@/src/core/models/enums";

/** Views a project can open in. */
export const OPEN_VIEWS = ["list", "board", "calendar", "gantt"] as const;
export type OpenView = (typeof OPEN_VIEWS)[number];

export const OPEN_VIEW_LABEL: Record<OpenView, string> = { list: "List", board: "Board", calendar: "Calendar", gantt: "Gantt" };

export const DEFAULT_STATUS_NAMES: Record<TaskStatus, string> = {
  todo: "Todo", in_progress: "In progress", done: "Done", canceled: "Canceled",
};

export type StatusNames = Record<TaskStatus, string>;

/** The workspace's names for the four statuses, falling back to the defaults for any left blank. */
export function statusNamesFor(custom: Partial<Record<TaskStatus, string | null>> | null | undefined): StatusNames {
  return Object.fromEntries(TASK_STATUSES.map((status) => [status, custom?.[status]?.trim() || DEFAULT_STATUS_NAMES[status]])) as StatusNames;
}

/** Names must be short, and different from each other so lists stay readable. */
export function checkStatusNames(names: Partial<Record<TaskStatus, string | null>>): string | null {
  const resolved = statusNamesFor(names);
  for (const status of TASK_STATUSES) {
    if (resolved[status].length > 24) return `“${resolved[status]}” is too long (24 characters at most)`;
  }
  const lower = TASK_STATUSES.map((status) => resolved[status].toLowerCase());
  return new Set(lower).size === lower.length ? null : "Each status needs a different name";
}

/** One emoji (with its modifiers), or nothing. */
export function isWorkspaceIcon(value: string) {
  if (!value || value.length > 16) return false;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)];
  return segments.length === 1 && /\p{Extended_Pictographic}/u.test(value);
}

/** The letter shown when a workspace has no emoji. */
export function workspaceInitial(name: string) {
  const first = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name.trim())][0]?.segment ?? "?";
  return first.toLocaleUpperCase();
}
