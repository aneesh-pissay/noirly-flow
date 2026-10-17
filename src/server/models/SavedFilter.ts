import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/** A person's own saved task filter in one workspace: a name and a query (see src/core/filter-query.ts). */
const savedFilterSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    query: { type: String, required: true, trim: true, maxlength: 500 },
    position: { type: Number, default: 0 },
  },
  { timestamps: true },
);

savedFilterSchema.index({ userId: 1, workspaceId: 1, position: 1 });

export type SavedFilterDocument = InferSchemaType<typeof savedFilterSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const SavedFilter: Model<SavedFilterDocument> =
  (models.SavedFilter as Model<SavedFilterDocument>) ||
  model<SavedFilterDocument>("SavedFilter", savedFilterSchema, "saved_filters");
