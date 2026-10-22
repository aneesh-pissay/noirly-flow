import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * Time someone spent on a task: a finished entry (start, end, minutes), or the
 * one timer they have running (no end yet). One running entry per person.
 */
const timeEntrySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    minutes: { type: Number, default: null, min: 1, max: 1440 },
    note: { type: String, default: null, trim: true, maxlength: 280 },
  },
  { timestamps: true },
);

timeEntrySchema.index({ taskId: 1, startedAt: -1 });
timeEntrySchema.index({ userId: 1, endedAt: 1 });
timeEntrySchema.index({ workspaceId: 1, startedAt: -1 });

export type TimeEntryDocument = InferSchemaType<typeof timeEntrySchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const TimeEntry: Model<TimeEntryDocument> =
  (models.TimeEntry as Model<TimeEntryDocument>) ||
  model<TimeEntryDocument>("TimeEntry", timeEntrySchema, "time_entries");
