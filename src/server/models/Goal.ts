import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A checkpoint on the way to a goal; tasks can point at one. */
const milestoneSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // All-day, at local noon like task dates.
    dueAt: { type: Date, default: null },
  },
  { _id: true },
);

/** A workspace outcome that tasks roll up into, through its milestones or directly. */
const goalSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: null, maxlength: 2000 },
    // All-day target date, at local noon.
    targetAt: { type: Date, default: null },
    milestones: { type: [milestoneSchema], default: [] },
    archivedAt: { type: Date, default: null },
    createdById: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
  },
  { timestamps: true },
);

goalSchema.index({ workspaceId: 1, archivedAt: 1, createdAt: 1 });

export type GoalDocument = InferSchemaType<typeof goalSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Goal: Model<GoalDocument> =
  (models.Goal as Model<GoalDocument>) ||
  model<GoalDocument>("Goal", goalSchema, "goals");
