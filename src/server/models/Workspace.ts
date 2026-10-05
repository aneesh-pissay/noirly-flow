import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { WORKSPACE_KINDS } from "@/src/core/models/enums";

const workspaceSchema = new Schema(
  {
    kind: {
      type: String,
      enum: WORKSPACE_KINDS,
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, index: true },
    ownerUserId: {
      type: Schema.Types.ObjectId,
      ref: "FlowUser",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

// One personal workspace per user. First-login bootstrap can run on several
// concurrent requests; this is what makes it safe (see ensurePersonalWorkspace).
workspaceSchema.index(
  { ownerUserId: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { kind: "personal" },
    name: "one_personal_workspace_per_owner",
  },
);

export type WorkspaceDocument = InferSchemaType<typeof workspaceSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Workspace: Model<WorkspaceDocument> =
  (models.Workspace as Model<WorkspaceDocument>) ||
  model<WorkspaceDocument>("Workspace", workspaceSchema, "workspaces");
