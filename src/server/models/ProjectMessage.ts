import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A message in a project's team chat. */
const projectMessageSchema = new Schema(
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
      required: true,
    },
    authorId: {
      type: Schema.Types.ObjectId,
      ref: "FlowUser",
      required: true,
      index: true,
    },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Newest-first pages of one project's chat.
projectMessageSchema.index({ projectId: 1, _id: -1 });

export type ProjectMessageDocument = InferSchemaType<typeof projectMessageSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ProjectMessage: Model<ProjectMessageDocument> =
  (models.ProjectMessage as Model<ProjectMessageDocument>) ||
  model<ProjectMessageDocument>("ProjectMessage", projectMessageSchema, "project_messages");
