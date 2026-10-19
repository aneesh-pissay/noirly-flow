import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * "When X, if Y, then Z" on a project. Trigger, conditions and actions are
 * checked by the API schema (see src/core/automations.ts for their shapes).
 */
const automationRuleSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    enabled: { type: Boolean, default: true },
    trigger: { type: Schema.Types.Mixed, required: true },
    conditions: { type: [Schema.Types.Mixed], default: [] },
    actions: { type: [Schema.Types.Mixed], default: [] },
    // Dates in actions ("due in 2 days") are counted in this zone.
    timeZone: { type: String, default: "UTC" },
    createdById: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
    runCount: { type: Number, default: 0 },
    lastRunAt: { type: Date, default: null },
  },
  { timestamps: true },
);

automationRuleSchema.index({ projectId: 1, enabled: 1 });

export type AutomationRuleDocument = InferSchemaType<typeof automationRuleSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const AutomationRule: Model<AutomationRuleDocument> =
  (models.AutomationRule as Model<AutomationRuleDocument>) ||
  model<AutomationRuleDocument>("AutomationRule", automationRuleSchema, "automation_rules");
