import { z } from "zod";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/src/core/models/enums";

const dueAtSchema = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = new Date(`${value}T12:00:00`);
      if (Number.isNaN(parsed.getTime())) return null;
      return parsed.toISOString();
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  });

export const createTaskBodySchema = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(20_000).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  columnId: z.string().min(1).nullable().optional(),
  parentTaskId: z.string().min(1).nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueAt: dueAtSchema,
});

export const updateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().max(20_000).nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueAt: dueAtSchema,
    projectId: z.string().min(1).nullable().optional(),
    columnId: z.string().min(1).nullable().optional(),
    parentTaskId: z.string().min(1).nullable().optional(),
    position: z.number().finite().optional(),
    tagIds: z.array(z.string().min(1)).optional(),
    assigneeIds: z.array(z.string().min(1)).optional(),
    recurrence: z
      .object({
        frequency: z.enum(["daily", "weekly"]),
        interval: z.number().int().min(1).max(30).default(1),
      })
      .nullable()
      .optional(),
    checklist: z
      .array(
        z.object({
          id: z.string().optional(),
          title: z.string().trim().min(1).max(500),
          completed: z.boolean().optional(),
          position: z.number().optional(),
        }),
      )
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const listTasksQuerySchema = z.object({
  projectId: z.string().min(1).optional(),
  inbox: z.enum(["1", "true"]).optional(),
  root: z.enum(["1", "true"]).optional(),
  parentTaskId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  search: z.string().optional(),
  due: z.enum(["overdue", "today", "upcoming", "none"]).optional(),
});

export const reorderTasksBodySchema = z.object({
  moves: z
    .array(
      z.object({
        taskId: z.string().min(1),
        columnId: z.string().min(1).nullable(),
        position: z.number().finite(),
        status: z.enum(TASK_STATUSES).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const createTagBodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/)
    .optional(),
});

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).nullable().optional(),
});

export const createWorkspaceBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const createInviteBodySchema = z.object({
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

export const updateMemberBodySchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

export const acceptInviteBodySchema = z.object({
  token: z.string().min(8).max(128),
});

export const createCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

const optionalText = (max: number) =>
  z
    .union([z.string().max(max), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    });

export const updateMeBodySchema = z.object({
  profile: z.object({
    displayName: optionalText(80),
    title: optionalText(80),
    timezone: optionalText(80),
    bio: optionalText(280),
  }),
});

export const createReportBodySchema = z
  .object({
    targetType: z.enum(["comment", "task", "user"]),
    targetId: z.string().min(1).max(64),
    workspaceId: z.string().min(1).max(64).optional(),
    reason: z.enum(["spam", "harassment", "hate", "sexual", "violence", "self_harm", "illegal", "other"]),
    details: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
