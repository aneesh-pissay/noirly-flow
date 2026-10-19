import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  Types,
} from "mongoose";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/src/core/models/enums";

const checklistItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    completed: { type: Boolean, default: false },
    position: { type: Number, required: true },
  },
  { _id: true },
);

const recurrenceSchema = new Schema(
  {
    frequency: {
      type: String,
      enum: ["daily", "weekly", "monthly", "yearly", "custom"],
      required: true,
    },
    interval: { type: Number, default: 1 },
    byWeekday: { type: [Number], default: undefined },
    monthDay: { type: Number, default: null },
    fromCompletion: { type: Boolean, default: false },
    timeZone: { type: String, default: null },
    until: { type: Date, default: null },
    count: { type: Number, default: null },
    rrule: { type: String, default: null },
  },
  { _id: false },
);

const taskSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      default: null,
      index: true,
    },
    columnId: {
      type: Schema.Types.ObjectId,
      ref: "BoardColumn",
      default: null,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: "todo",
      index: true,
    },
    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: "none",
    },
    dueAt: { type: Date, default: null },
    // False: an all-day due date (stored at local noon). True: dueAt is the exact due time.
    dueHasTime: { type: Boolean, default: false },
    startAt: { type: Date, default: null },
    // A repeating task tracked as a habit (streaks on the Habits page).
    habit: { type: Boolean, default: false },
    // The first task of a repeating series; each next copy carries it, so its history can be read.
    seriesId: { type: Schema.Types.ObjectId, ref: "Task", default: null },
    // Tasks that must be finished before this one can be (same workspace, no loops).
    blockedByIds: { type: [Schema.Types.ObjectId], ref: "Task", default: [] },
    // A section of the task's project (list view grouping), or null.
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    // A goal the task rolls up into, and optionally one of its milestones.
    goalId: { type: Schema.Types.ObjectId, ref: "Goal", default: null },
    milestoneId: { type: Schema.Types.ObjectId, default: null },
    // Custom field values for the task's project, keyed by ProjectField id.
    fieldValues: { type: Schema.Types.Mixed, default: {} },
    // A hard "must be done by" date, separate from the planned due date. All-day, at local noon.
    deadlineAt: { type: Date, default: null },
    // How long the task should take, in minutes; null when not estimated.
    durationMinutes: { type: Number, default: null, min: 1, max: 1440 },
    // Remind this many minutes before a timed due date (0 = at the time). Kept,
    // but inactive, while the task has no due time.
    reminderMinutes: { type: Number, default: null, min: 0, max: 10080 },
    // When the reminder fires (dueAt − reminderMinutes), and when it was sent.
    reminderAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    position: { type: Number, required: true, default: 0 },
    assigneeIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "FlowUser" }],
      default: [],
    },
    emailDeliveries: {
      type: [new Schema({
        _id: { type: Schema.Types.ObjectId, required: true, default: () => new Types.ObjectId() },
        userId: { type: Schema.Types.ObjectId, required: true, ref: "FlowUser" },
        assignmentPending: { type: Boolean, default: true },
        remindedOn: { type: String, default: "" },
        nextAttemptAt: { type: Date, default: () => new Date(0) },
        lockedUntil: { type: Date, default: () => new Date(0) },
        attempts: { type: Number, default: 0 },
      })],
      default: [],
    },
    emailCheckedAt: { type: Date, default: () => new Date(0) },
    completionDeliveries: {
      type: [new Schema({
        _id: { type: Schema.Types.ObjectId, required: true, default: () => new Types.ObjectId() },
        userId: { type: Schema.Types.ObjectId, required: true, ref: "FlowUser" },
        pending: { type: Boolean, default: true },
        nextAttemptAt: { type: Date, default: () => new Date(0) },
        lockedUntil: { type: Date, default: () => new Date(0) },
        attempts: { type: Number, default: 0 },
      })],
      default: [],
    },
    tagIds: {
      type: [{ type: Schema.Types.ObjectId }],
      default: [],
    },
    parentTaskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      default: null,
      index: true,
    },
    recurrence: { type: recurrenceSchema, default: null },
    checklist: { type: [checklistItemSchema], default: [] },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: "FlowUser",
      required: true,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

taskSchema.index({ workspaceId: 1, deletedAt: 1 });
taskSchema.index({ projectId: 1, columnId: 1, position: 1 });
taskSchema.index({ deletedAt: 1, status: 1, dueAt: 1, emailCheckedAt: 1 });
taskSchema.index({ reminderSentAt: 1, reminderAt: 1 });
taskSchema.index({ workspaceId: 1, habit: 1 });
taskSchema.index({ seriesId: 1, dueAt: -1 });
taskSchema.index({ goalId: 1, status: 1 });
taskSchema.index({ "emailDeliveries.assignmentPending": 1, emailCheckedAt: 1 });
taskSchema.index({ "completionDeliveries.pending": 1, emailCheckedAt: 1 });

export type TaskDocument = InferSchemaType<typeof taskSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Task: Model<TaskDocument> =
  (models.Task as Model<TaskDocument>) ||
  model<TaskDocument>("Task", taskSchema, "tasks");
