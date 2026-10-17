import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A named group of tasks in a project's list view; separate from board columns. */
const sectionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    position: { type: Number, required: true },
  },
  { timestamps: true },
);

sectionSchema.index({ projectId: 1, position: 1 });

export type SectionDocument = InferSchemaType<typeof sectionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Section: Model<SectionDocument> =
  (models.Section as Model<SectionDocument>) ||
  model<SectionDocument>("Section", sectionSchema, "sections");
