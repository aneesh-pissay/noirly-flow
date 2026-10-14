import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

const commentSchema = new Schema(
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
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "FlowUser",
      required: true,
    },
    body: { type: String, required: true, trim: true, maxlength: 8000 },
    mentions: { type: [new Schema({
      userId: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
      start: { type: Number, required: true },
      end: { type: Number, required: true },
    }, { _id: false })], default: [] },
    mentionDeliveries: { type: [new Schema({
      userId: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
      status: { type: String, enum: ["pending", "sending", "sent", "skipped"], default: "pending" },
      attempts: { type: Number, default: 0 },
      nextAttemptAt: { type: Date, default: Date.now },
      lockedUntil: { type: Date, default: () => new Date(0) },
    }, { _id: false })], default: [] },
    /** Set when the author edits the body; `updatedAt` also moves for mail bookkeeping. */
    editedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

commentSchema.index({ taskId: 1, createdAt: 1 });
commentSchema.index({ "mentionDeliveries.nextAttemptAt": 1 });

export type CommentDocument = InferSchemaType<typeof commentSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Comment: Model<CommentDocument> =
  (models.Comment as Model<CommentDocument>) ||
  model<CommentDocument>("Comment", commentSchema, "comments");
