import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";

/**
 * Sessions ended by sign-out. Auth.js JWT sessions are stateless, so without
 * this a session cookie that comes back after sign-out (a late prefetch
 * response re-sets it) would still be accepted. Rows expire on their own once
 * the session they record could no longer be valid anyway.
 */
const revokedSessionSchema = new Schema({
  sid: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export type RevokedSessionDocument = InferSchemaType<typeof revokedSessionSchema> & {
  _id: Types.ObjectId;
};

export const RevokedSession: Model<RevokedSessionDocument> =
  (models.RevokedSession as Model<RevokedSessionDocument>) ||
  model<RevokedSessionDocument>("RevokedSession", revokedSessionSchema, "revoked_sessions");
