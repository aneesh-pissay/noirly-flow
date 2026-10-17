import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { MEMBER_ROLES } from "@/src/core/models/enums";

const workspaceMembershipSchema = new Schema(
  {
    workspaceId: {
      type: Schema.Types.ObjectId,
      ref: "Workspace",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "FlowUser",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: MEMBER_ROLES,
      required: true,
    },
    // Minutes available per weekday, Sunday first; unset means 8h Monday to Friday.
    capacityMinutes: { type: [Number], default: undefined },
  },
  { timestamps: true },
);

workspaceMembershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });

export type WorkspaceMembershipDocument = InferSchemaType<
  typeof workspaceMembershipSchema
> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const WorkspaceMembership: Model<WorkspaceMembershipDocument> =
  (models.WorkspaceMembership as Model<WorkspaceMembershipDocument>) ||
  model<WorkspaceMembershipDocument>(
    "WorkspaceMembership",
    workspaceMembershipSchema,
    "workspace_memberships",
  );
