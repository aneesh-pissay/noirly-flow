import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { QUESTION_KINDS } from "@/src/core/forms";
import { TASK_PRIORITIES } from "@/src/core/models/enums";

const questionSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    kind: { type: String, enum: QUESTION_KINDS, required: true },
    required: { type: Boolean, default: false },
    options: { type: [{ type: String, trim: true, maxlength: 80 }], default: [] },
  },
  { _id: true },
);

/** A public form that turns each submission into a task in its project. */
const intakeFormSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    // The unguessable id in the public link, /f/<publicId>.
    publicId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    intro: { type: String, default: null, maxlength: 2000 },
    titleLabel: { type: String, required: true, trim: true, maxlength: 120 },
    askDetails: { type: Boolean, default: true },
    questions: { type: [questionSchema], default: [] },
    defaults: {
      priority: { type: String, enum: TASK_PRIORITIES, default: "none" },
      sectionId: { type: Schema.Types.ObjectId, default: null },
      tagIds: { type: [Schema.Types.ObjectId], default: [] },
      assigneeId: { type: Schema.Types.ObjectId, default: null },
    },
    confirmation: { type: String, default: null, maxlength: 500 },
    enabled: { type: Boolean, default: true },
    // Tasks are created as this person, so automations and webhooks run as usual.
    createdById: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
    submissionCount: { type: Number, default: 0 },
    lastSubmittedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export type IntakeFormDocument = InferSchemaType<typeof intakeFormSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const IntakeForm: Model<IntakeFormDocument> =
  (models.IntakeForm as Model<IntakeFormDocument>) ||
  model<IntakeFormDocument>("IntakeForm", intakeFormSchema, "intake_forms");
