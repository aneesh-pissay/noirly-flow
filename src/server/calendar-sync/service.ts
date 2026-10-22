import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { CalendarConnection, CalendarEventLink } from "@/src/server/models";
import { CALENDAR_APIS } from "@/src/server/calendar-sync/providers";
import { canEncryptTokens, openToken, sealToken } from "@/src/server/calendar-sync/crypto";
import { syncConnection } from "@/src/server/calendar-sync/engine";
import { SYNC_PROVIDERS, type SyncProviderId } from "@/src/core/calendar-sync";

export const OAUTH_COOKIE = "flow-calendar-oauth";
const OAUTH_COOKIE_SECONDS = 600;
/** How often one person's calendars sync in the background, at most. */
const BACKGROUND_GAP_MS = 2 * 60_000;
const CRON_BATCH = 25;

export type CalendarSyncStatus = {
  provider: SyncProviderId;
  /** Client ID, secret and the token key are all set on this server. */
  available: boolean;
  connected: boolean;
  accountEmail: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export function isProvider(value: string): value is SyncProviderId {
  return (SYNC_PROVIDERS as readonly string[]).includes(value);
}

export function providerAvailable(provider: SyncProviderId) {
  return CALENDAR_APIS[provider].configured() && canEncryptTokens();
}

function appOrigin() {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || "http://localhost:3002";
  return new URL(base).origin;
}

export const redirectUri = (provider: SyncProviderId) => `${appOrigin()}/api/calendar-sync/${provider}/callback`;

export function calendarSyncStatus(userId: string) {
  return withDb(async (): Promise<CalendarSyncStatus[]> => {
    const connections = await CalendarConnection.find({ userId: new Types.ObjectId(userId) }).lean();
    return SYNC_PROVIDERS.map((provider) => {
      const connection = connections.find((c) => c.provider === provider);
      return {
        provider,
        available: providerAvailable(provider),
        connected: Boolean(connection),
        accountEmail: connection?.accountEmail ?? null,
        lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
        lastError: connection?.lastError ?? null,
      };
    });
  });
}

/** Where to send the browser to sign in, and the cookie that proves the reply is for this request. */
export function startConnect(provider: SyncProviderId) {
  if (!providerAvailable(provider)) throw new ApiError(503, "unavailable", "This calendar isn't set up on this server");
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const cookie = sealToken(JSON.stringify({ provider, state, verifier }));
  return {
    url: CALENDAR_APIS[provider].authorizeUrl({ state, codeChallenge: challenge, redirectUri: redirectUri(provider) }),
    cookie: { name: OAUTH_COOKIE, value: cookie, maxAge: OAUTH_COOKIE_SECONDS },
  };
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** The provider's reply: checks it, keeps the tokens, makes the Flow calendar, and syncs once in the background. */
export async function finishConnect(userId: string, provider: SyncProviderId, input: { code: string | null; state: string | null; cookie: string | undefined }) {
  if (!input.cookie || !input.code || !input.state) throw new ApiError(400, "invalid_request", "The sign-in didn't finish. Try connecting again.");
  let saved: { provider: string; state: string; verifier: string };
  try {
    saved = JSON.parse(openToken(input.cookie));
  } catch {
    throw new ApiError(400, "invalid_request", "The sign-in didn't finish. Try connecting again.");
  }
  if (saved.provider !== provider || !same(saved.state, input.state)) throw new ApiError(400, "invalid_request", "That sign-in wasn't started here.");
  const api = CALENDAR_APIS[provider];
  const tokens = await api.exchange(input.code, saved.verifier, redirectUri(provider));
  const connection = await withDb(async () => {
    const owner = new Types.ObjectId(userId);
    const previous = await CalendarConnection.findOne({ userId: owner, provider }).select("_id").lean();
    if (previous) await CalendarEventLink.deleteMany({ connectionId: previous._id });
    return CalendarConnection.findOneAndUpdate(
      { userId: owner, provider },
      { $set: {
        accountEmail: tokens.email, accessToken: sealToken(tokens.accessToken), refreshToken: tokens.refreshToken ? sealToken(tokens.refreshToken) : null,
        expiresAt: tokens.expiresAt, calendarId: null, syncState: null, lastSyncedAt: null, lastError: null, lockedUntil: null,
      } },
      { upsert: true, returnDocument: "after" },
    );
  });
  if (connection) after(() => syncConnection(connection._id).then(() => undefined, () => undefined));
}

export async function syncNow(userId: string, provider: SyncProviderId) {
  const connection = await withDb(() => CalendarConnection.findOne({ userId: new Types.ObjectId(userId), provider }).select("_id").lean());
  if (!connection) throw new ApiError(404, "not_found", "That calendar isn't connected");
  try {
    const outcome = await syncConnection(connection._id);
    if (!outcome) throw new ApiError(409, "busy", "A sync is already running. Try again in a moment.");
    return outcome;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "sync_failed", error instanceof Error ? error.message : "Sync failed");
  }
}

/** Disconnects, and deletes the Flow calendar from that account (best effort: the person may have revoked access already). */
export async function disconnect(userId: string, provider: SyncProviderId) {
  await withDb(async () => {
    const connection = await CalendarConnection.findOne({ userId: new Types.ObjectId(userId), provider });
    if (!connection) return;
    try {
      if (connection.calendarId) await CALENDAR_APIS[provider].deleteCalendar(openToken(connection.accessToken), connection.calendarId);
    } catch {
      console.error("Couldn't delete the Flow calendar while disconnecting");
    }
    await CalendarEventLink.deleteMany({ connectionId: connection._id });
    await connection.deleteOne();
  });
}

const lastBackground = new Map<string, number>();

/** After the bell's poll: someone using Flow gets their calendars synced every couple of minutes. */
export function scheduleCalendarSync(userId: string) {
  const now = Date.now();
  if (now - (lastBackground.get(userId) ?? 0) < BACKGROUND_GAP_MS) return;
  lastBackground.set(userId, now);
  after(async () => {
    try {
      const connections = await withDb(() => CalendarConnection.find({ userId: new Types.ObjectId(userId) }).select("_id provider").lean());
      for (const connection of connections) {
        if (providerAvailable(connection.provider as SyncProviderId)) await syncConnection(connection._id).catch(() => undefined);
      }
    } catch {
      console.error("Background calendar sync failed");
    }
  });
}

/** For the cron: the connections that synced longest ago. */
export function runCalendarSyncs(limit = CRON_BATCH) {
  return withDb(async () => {
    const connections = await CalendarConnection.find({}).sort({ lastSyncedAt: 1 }).limit(limit).select("_id provider").lean();
    let synced = 0;
    for (const connection of connections) {
      if (!providerAvailable(connection.provider as SyncProviderId)) continue;
      try {
        if (await syncConnection(connection._id)) synced += 1;
      } catch {
        // Recorded on the connection as lastError.
      }
    }
    return { attempted: connections.length, synced };
  });
}
