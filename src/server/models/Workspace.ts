import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { PROJECT_VIEWS, WORKSPACE_KINDS } from "@/src/core/models/enums";

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
    /**
     * The Noirly space (Identity organization) this team follows. While set,
     * the space's member list decides who is in this workspace and with what
     * role; Flow's own invites and member changes are off.
     */
    spaceId: { type: String, default: null, index: true },
    spaceName: { type: String, default: null },
    spaceSyncedAt: { type: Date, default: null },
    // Customisation (admins): an emoji and its colour, the view new projects
    // open in, and names for the four statuses (blank keeps the default).
    icon: { type: String, default: null },
    color: { type: String, default: null },
    defaultView: { type: String, enum: PROJECT_VIEWS, default: "board" },
    statusNames: {
      todo: { type: String, default: null },
      in_progress: { type: String, default: null },
      done: { type: String, default: null },
      canceled: { type: String, default: null },
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
