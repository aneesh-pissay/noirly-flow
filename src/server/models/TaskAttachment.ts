import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A file attached to a task. The bytes live in storage (see server/storage/attachments.ts). */
const taskAttachmentSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    uploadedById: {
      type: Schema.Types.ObjectId,
      ref: "FlowUser",
      required: true,
      index: true,
    },
    filename: { type: String, required: true, trim: true, maxlength: 255 },
    mime: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    storage: { type: String, enum: ["r2", "local"], required: true },
    key: { type: String, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type TaskAttachmentDocument = InferSchemaType<typeof taskAttachmentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const TaskAttachment: Model<TaskAttachmentDocument> =
  (models.TaskAttachment as Model<TaskAttachmentDocument>) ||
  model<TaskAttachmentDocument>("TaskAttachment", taskAttachmentSchema, "task_attachments");
