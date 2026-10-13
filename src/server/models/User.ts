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
    },
  },
  { timestamps: true },
);

export type FlowUserDocument = InferSchemaType<typeof userSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const FlowUser: Model<FlowUserDocument> =
  (models.FlowUser as Model<FlowUserDocument>) ||
  model<FlowUserDocument>("FlowUser", userSchema, "users");
