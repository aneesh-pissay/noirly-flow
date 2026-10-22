import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

const userSchema = new Schema(
  {
    identitySub: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    emailVerified: { type: Boolean, default: false },
    displayName: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: null },
    profile: {
      displayName: { type: String, default: null, trim: true },
      title: { type: String, default: null, trim: true },
      timezone: { type: String, default: null, trim: true },
      bio: { type: String, default: null, trim: true },
      taskSaveMode: { type: String, enum: ["auto", "manual"], default: "auto" },
      // Layout: how tightly lists are packed, and whether pages use the full width.
      density: { type: String, enum: ["comfortable", "compact"], default: "comfortable" },
      contentWidth: { type: String, enum: ["standard", "wide"], default: "standard" },
    },
    /** Projects this person starred; personal, shown at the top of the sidebar. */
    favoriteProjectIds: { type: [Schema.Types.ObjectId], ref: "Project", default: [] },
    /** Private calendar subscription link; only a hash of its secret is kept. */
    calendarFeed: {
      tokenHash: { type: String, default: null },
      createdAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

userSchema.index(
  { "calendarFeed.tokenHash": 1 },
  { unique: true, partialFilterExpression: { "calendarFeed.tokenHash": { $type: "string" } } },
);

export type FlowUserDocument = InferSchemaType<typeof userSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const FlowUser: Model<FlowUserDocument> =
  (models.FlowUser as Model<FlowUserDocument>) ||
  model<FlowUserDocument>("FlowUser", userSchema, "users");
