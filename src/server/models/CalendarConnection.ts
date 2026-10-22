import {
  Schema,
  models,
  model,
  type InferSchemaType,
  type Model,
  type Types,
} from "mongoose";
import { SYNC_PROVIDERS } from "@/src/core/calendar-sync";

/** Someone's link to their Google or Outlook calendar for two-way task sync. Tokens are encrypted. */
const calendarConnectionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "FlowUser", required: true },
    provider: { type: String, enum: SYNC_PROVIDERS, required: true },
    accountEmail: { type: String, default: null },
    accessToken: { type: String, required: true },
    refreshToken: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    // The "Noirly Flow" calendar Flow made in that account.
    calendarId: { type: String, default: null },
    // Where the last read of changes stopped (Google sync token, Graph delta link).
    syncState: { type: String, default: null },
    lastSyncedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    // A run in progress holds this, so two don't overlap.
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

calendarConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });
calendarConnectionSchema.index({ lastSyncedAt: 1 });

export type CalendarConnectionDocument = InferSchemaType<typeof calendarConnectionSchema> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const CalendarConnection: Model<CalendarConnectionDocument> =
  (models.CalendarConnection as Model<CalendarConnectionDocument>) ||
  model<CalendarConnectionDocument>("CalendarConnection", calendarConnectionSchema, "calendar_connections");

/** Which event stands for which task in a connection, and what both looked like when last in step. */
const calendarEventLinkSchema = new Schema(
  {
    connectionId: { type: Schema.Types.ObjectId, ref: "CalendarConnection", required: true },
    taskId: { type: Schema.Types.ObjectId, ref: "Task", required: true },
    eventId: { type: String, required: true },
    fingerprint: { type: String, required: true },
    syncedAt: { type: Date, required: true },
  },
  { timestamps: false },
);

calendarEventLinkSchema.index({ connectionId: 1, taskId: 1 }, { unique: true });
calendarEventLinkSchema.index({ connectionId: 1, eventId: 1 });

export type CalendarEventLinkDocument = InferSchemaType<typeof calendarEventLinkSchema> & { _id: Types.ObjectId };

export const CalendarEventLink: Model<CalendarEventLinkDocument> =
  (models.CalendarEventLink as Model<CalendarEventLinkDocument>) ||
  model<CalendarEventLinkDocument>("CalendarEventLink", calendarEventLinkSchema, "calendar_event_links");
