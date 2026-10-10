import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

export const REPORT_TARGETS = ["comment", "task", "user"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "self_harm",
  "illegal",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["open", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * A user's report of a comment, task or member, for the Noirly team to
 * review (`npx tsx scripts/reports.ts`). `excerpt` keeps a copy of the
 * reported text so the report still makes sense if the content is edited or
 * deleted. Deleted with either person's account (users/delete-account.ts).
 */
const reportSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "Workspace", required: true, index: true },
    reporterId: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true, index: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    /** Who wrote / created / is the reported thing. */
    targetUserId: { type: Schema.Types.ObjectId, ref: "FlowUser", default: null, index: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, default: null, trim: true, maxlength: 1000 },
    excerpt: { type: String, default: null, maxlength: 2000 },
    status: { type: String, enum: REPORT_STATUSES, default: "open", index: true },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: true },
);

reportSchema.index({ reporterId: 1, targetType: 1, targetId: 1, status: 1 });

export type ReportDocument = InferSchemaType<typeof reportSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Report: Model<ReportDocument> =
  (models.Report as Model<ReportDocument>) ||
  model<ReportDocument>("Report", reportSchema, "reports");
