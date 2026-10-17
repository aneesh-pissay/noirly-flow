import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * A reusable task (with subtasks) or project (sections and tasks), shared by
 * the workspace. `data` is checked against src/core/templates.ts when saved.
 */
const templateSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    kind: { type: String, enum: ["task", "project"], required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    data: { type: Schema.Types.Mixed, required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
  },
  { timestamps: true },
);

templateSchema.index({ workspaceId: 1, kind: 1, name: 1 });

export type TemplateDocument = InferSchemaType<typeof templateSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Template: Model<TemplateDocument> =
  (models.Template as Model<TemplateDocument>) ||
  model<TemplateDocument>("Template", templateSchema, "templates");
