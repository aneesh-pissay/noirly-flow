import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

export const NOTIFICATION_KINDS = ["mention", "assigned", "comment", "reminder"] as const;

/** One line in a person's in-app inbox: someone did something to a task they follow. */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true, index: true },
    commentId: { type: Schema.Types.ObjectId, ref: "Comment", default: null, index: true },
    actorId: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true, index: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });

export type NotificationDocument = InferSchemaType<typeof notificationSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export const Notification: Model<NotificationDocument> =
  (models.Notification as Model<NotificationDocument>) ||
  model<NotificationDocument>("Notification", notificationSchema, "notifications");
