import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { MEMBER_ROLES } from "@/src/core/models/enums";

const inviteRoles = MEMBER_ROLES.filter((role) => role !== "owner");

const workspaceInviteSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: inviteRoles,
      default: "member",
    },
    tokenHash: { type: String, required: true, unique: true, index: true },
    /** Set for emailed invites: only the account with this email can accept. */
    email: { type: String, default: null, lowercase: true, trim: true },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: "FlowUser",
      required: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type WorkspaceInviteDocument = InferSchemaType<
  typeof workspaceInviteSchema
> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const WorkspaceInvite: Model<WorkspaceInviteDocument> =
  (models.WorkspaceInvite as Model<WorkspaceInviteDocument>) ||
  model<WorkspaceInviteDocument>(
    "WorkspaceInvite",
    workspaceInviteSchema,
    "workspace_invites",
  );
