export const WORKSPACE_KINDS = ["personal", "team"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export const MEMBER_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PROJECT_VIEWS = ["board", "list", "calendar"] as const;
export type ProjectView = (typeof PROJECT_VIEWS)[number];

export const TASK_STATUSES = ["todo", "in_progress", "done", "canceled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Statuses a board column can map to, in board order. */
export const COLUMN_STATUSES = ["todo", "in_progress", "done"] as const;

export const TASK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const RECURRENCE_FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];
