import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { FIELD_TYPES } from "@/src/core/custom-fields";

/** A custom field on a project. Task values live on the task, keyed by this field's id. */
const projectFieldSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    type: { type: String, enum: FIELD_TYPES, required: true },
    // Choices for a select field.
    options: {
      type: [new Schema({ name: { type: String, required: true, trim: true, maxlength: 40 } }, { _id: true })],
      default: [],
    },
    position: { type: Number, required: true },
  },
  { timestamps: true },
);

projectFieldSchema.index({ projectId: 1, position: 1 });

export type ProjectFieldDocument = InferSchemaType<typeof projectFieldSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const ProjectField: Model<ProjectFieldDocument> =
  (models.ProjectField as Model<ProjectFieldDocument>) ||
  model<ProjectFieldDocument>("ProjectField", projectFieldSchema, "project_fields");
