import { z } from "zod";
import {
  COLUMN_STATUSES,
  RECURRENCE_FREQUENCIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/src/core/models/enums";

const recurrenceSchema = z
  .object({
    frequency: z.enum(RECURRENCE_FREQUENCIES),
    interval: z.number().int().min(1).max(365).default(1),
    byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    monthDay: z.number().int().min(1).max(31).optional(),
    fromCompletion: z.boolean().optional(),
    timeZone: z.string().max(64).optional(),
  })
  .nullable()
  .optional();

const reminderSchema = z.number().int().min(0).max(10080).nullable().optional();

const durationSchema = z.number().int().min(1).max(1440).nullable().optional();

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
  assigneeIds: z.array(z.string().min(1)).max(100).optional(),
  title: z.string().trim().min(1).max(500),
  description: z.string().trim().max(20_000).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  columnId: z.string().min(1).nullable().optional(),
  parentTaskId: z.string().min(1).nullable().optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueAt: dueAtSchema,
  dueHasTime: z.boolean().optional(),
  startAt: dueAtSchema,
  deadlineAt: dueAtSchema,
  durationMinutes: durationSchema,
  reminderMinutes: reminderSchema,
  recurrence: recurrenceSchema,
  tagIds: z.array(z.string().min(1)).max(20).optional(),
  sectionId: z.string().min(1).nullable().optional(),
  goalId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
  milestoneId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
  blockedByIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(20).optional(),
});

export const prepareAttachmentUploadSchema = z.object({
  name: z.string().trim().min(1).max(1024),
  type: z.string().max(255).optional().default(""),
  size: z.number().int().min(1).max(25 * 1024 * 1024),
});

export const completeAttachmentUploadSchema = z.object({
  key: z.string().min(1).max(512),
  name: z.string().trim().min(1).max(1024),
});

export const updateTaskBodySchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().max(20_000).nullable().optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    dueAt: dueAtSchema,
    dueHasTime: z.boolean().optional(),
    startAt: dueAtSchema,
    deadlineAt: dueAtSchema,
    durationMinutes: durationSchema,
    reminderMinutes: reminderSchema,
    projectId: z.string().min(1).nullable().optional(),
    columnId: z.string().min(1).nullable().optional(),
    sectionId: z.string().min(1).nullable().optional(),
    goalId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
    milestoneId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
    fieldValues: z.record(z.string().regex(/^[a-f0-9]{24}$/i), z.union([z.string().max(500), z.number(), z.null()])).optional(),
    blockedByIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(20).optional(),
    habit: z.boolean().optional(),
    parentTaskId: z.string().min(1).nullable().optional(),
    position: z.number().finite().optional(),
    tagIds: z.array(z.string().min(1)).optional(),
    assigneeIds: z.array(z.string().min(1)).optional(),
    recurrence: recurrenceSchema,
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
  // An exact range from the browser, so "today" is the user's today, not the
  // server's (UTC). Wins over `due`.
  dueAfter: z.string().datetime({ offset: true }).optional(),
  dueBefore: z.string().datetime({ offset: true }).optional(),
  tag: z.string().min(1).optional(),
  completedAfter: z.string().datetime({ offset: true }).optional(),
  goal: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
});

export const bulkTasksBodySchema = z
  .object({
    taskIds: z.array(z.string().min(1)).min(1).max(100),
    patch: z
      .object({
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        dueAt: dueAtSchema,
        dueHasTime: z.boolean().optional(),
        projectId: z.string().min(1).nullable().optional(),
        assigneeIds: z.array(z.string().min(1)).max(100).optional(),
      })
      .refine((value) => Object.values(value).some((field) => field !== undefined), { message: "Nothing to change" })
      .optional(),
    delete: z.literal(true).optional(),
  })
  .refine((value) => Boolean(value.patch) !== Boolean(value.delete), { message: "Send a patch or delete, not both" });

export const saveTemplateBodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("task"), taskId: z.string().min(1), name: z.string().trim().min(1).max(80) }),
  z.object({ kind: z.literal("project"), projectId: z.string().min(1), name: z.string().trim().min(1).max(80) }),
]);

export const applyTemplateBodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("task"),
    projectId: z.string().min(1).nullable(),
    sectionId: z.string().min(1).nullable().optional(),
    overrides: z
      .object({
        title: z.string().trim().min(1).max(500).optional(),
        description: z.string().trim().max(20_000).nullable().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        dueAt: dueAtSchema,
        dueHasTime: z.boolean().optional(),
        assigneeIds: z.array(z.string().min(1)).max(100).optional(),
      })
      .optional(),
  }),
  z.object({ kind: z.literal("project"), name: z.string().trim().min(1).max(80) }),
]);

const dateSchema = z.string().datetime({ offset: true }).nullable().optional();

export const createGoalBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  targetAt: dateSchema,
});

export const updateGoalBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    targetAt: dateSchema,
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const milestoneBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  dueAt: dateSchema,
});

export const updateMilestoneBodySchema = z
  .object({ name: z.string().trim().min(1).max(120).optional(), dueAt: dateSchema })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

const fieldNameSchema = z.string().trim().min(1).max(40);

export const createFieldBodySchema = z.object({
  name: fieldNameSchema,
  type: z.enum(["text", "number", "select", "date", "person"]),
  options: z.array(z.object({ name: fieldNameSchema })).max(50).optional(),
});

export const updateFieldBodySchema = z
  .object({
    name: fieldNameSchema.optional(),
    position: z.number().finite().optional(),
    options: z.array(z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i).optional(), name: fieldNameSchema })).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const requestApprovalBodySchema = z.object({
  approverId: z.string().regex(/^[a-f0-9]{24}$/i),
});

export const decideApprovalBodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().max(1000).nullable().optional(),
});

const objectId = z.string().regex(/^[a-f0-9]{24}$/i);
const statusSchema = z.enum(["todo", "in_progress", "done", "canceled"]);
const prioritySchema = z.enum(["none", "low", "medium", "high", "urgent"]);

const automationTriggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("created") }),
  z.object({ type: z.literal("status_changed"), to: statusSchema.nullable().optional() }),
  z.object({ type: z.literal("priority_changed"), to: prioritySchema.nullable().optional() }),
  z.object({ type: z.literal("assignee_added") }),
]);

const automationConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("priority_is"), value: prioritySchema }),
  z.object({ type: z.literal("has_tag"), value: objectId }),
  z.object({ type: z.literal("assigned_to"), value: objectId }),
  z.object({ type: z.literal("in_section"), value: objectId }),
  z.object({ type: z.literal("title_contains"), value: z.string().trim().min(1).max(100) }),
]);

const automationActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_status"), value: statusSchema }),
  z.object({ type: z.literal("set_priority"), value: prioritySchema }),
  z.object({ type: z.literal("add_tag"), value: objectId }),
  z.object({ type: z.literal("add_assignee"), value: objectId }),
  z.object({ type: z.literal("move_to_section"), value: objectId }),
  z.object({ type: z.literal("set_due_in_days"), value: z.number().int().min(0).max(365) }),
]);

export const createAutomationBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  enabled: z.boolean().optional(),
  trigger: automationTriggerSchema,
  conditions: z.array(automationConditionSchema).max(5).default([]),
  actions: z.array(automationActionSchema).min(1).max(5),
  timeZone: z.string().max(64).optional(),
});

export const updateAutomationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
    trigger: automationTriggerSchema.optional(),
    conditions: z.array(automationConditionSchema).max(5).optional(),
    actions: z.array(automationActionSchema).min(1).max(5).optional(),
    timeZone: z.string().max(64).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

const webhookEventsSchema = z.array(z.enum(["task.created", "task.updated", "task.completed", "task.deleted", "comment.created"])).min(1).max(5);

export const createWebhookBodySchema = z.object({
  url: z.string().trim().min(1).max(2000),
  events: webhookEventsSchema,
});

export const updateWebhookBodySchema = z
  .object({ url: z.string().trim().min(1).max(2000).optional(), events: webhookEventsSchema.optional(), enabled: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const createAccessTokenBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  scope: z.enum(["read", "write"]),
  days: z.union([z.literal(30), z.literal(90), z.literal(365), z.literal(0)]),
});

export const createSectionBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const updateSectionBodySchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    position: z.number().finite().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field is required" });

export const createFilterBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  query: z.string().trim().min(1).max(500),
});

export const updateFilterBodySchema = createFilterBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field is required" },
);

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

export const updateTagBodySchema = createTagBodySchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field is required" },
);

export const createProjectBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).nullable().optional(),
});

export const updateProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    color: z.string().regex(/^#([0-9a-fA-F]{6})$/).nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Nothing to update",
  });

export const createColumnBodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  statusMapped: z.enum(COLUMN_STATUSES),
});

export const updateColumnBodySchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    statusMapped: z.enum(COLUMN_STATUSES).optional(),
  })
  .refine((value) => value.name !== undefined || value.statusMapped !== undefined, {
    message: "Nothing to update",
  });

export const reorderColumnsBodySchema = z.object({
  columnIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(50),
});

export const markNotificationsReadBodySchema = z.object({
  ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(100).optional(),
}).strict();

export const createWorkspaceBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const updateWorkspaceBodySchema = createWorkspaceBodySchema;

export const createInviteBodySchema = z.object({
  role: z.enum(["admin", "member", "viewer"]).default("member"),
  /** When set, the invite is emailed to this address and locked to it. */
  email: z.string().trim().toLowerCase().email().max(254).optional(),
});

export const updateMemberBodySchema = z.object({
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

export const acceptInviteBodySchema = z.object({
  token: z.string().min(8).max(128),
});

export const createChatMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const createCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(8000),
  mentions: z.array(z.object({
    userId: z.string().regex(/^[a-f0-9]{24}$/i),
    start: z.number().int().min(0).max(7999),
    end: z.number().int().min(1).max(8000),
  }).strict()).max(50).optional(),
});

export const updateCommentBodySchema = createCommentBodySchema;

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
    taskSaveMode: z.enum(["auto", "manual"]).optional(),
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
