import { wallToInstant } from "@/src/core/recurrence/next";
import type { EventInput, RemoteEvent, SyncProviderId } from "@/src/core/calendar-sync";

/**
 * Google Calendar and Microsoft Graph behind one interface. Each base URL can
 * be pointed elsewhere by an environment variable, which is how the e2e suite
 * talks to a fake calendar server instead of the real ones.
 */

export type Tokens = { accessToken: string; refreshToken: string | null; expiresAt: Date; email: string | null };
export type Changes = { events: RemoteEvent[]; state: string };

export class CalendarApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface CalendarApi {
  id: SyncProviderId;
  configured(): boolean;
  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string }): string;
  exchange(code: string, codeVerifier: string, redirectUri: string): Promise<Tokens>;
  refresh(refreshToken: string): Promise<Tokens>;
  createCalendar(token: string, timeZone: string): Promise<string>;
  calendarExists(token: string, calendarId: string): Promise<boolean>;
  deleteCalendar(token: string, calendarId: string): Promise<void>;
  createEvent(token: string, calendarId: string, event: EventInput): Promise<string>;
  /** Throws CalendarApiError 404 when the event is gone. */
  updateEvent(token: string, calendarId: string, eventId: string, event: EventInput): Promise<void>;
  deleteEvent(token: string, calendarId: string, eventId: string): Promise<void>;
  /** Everything since `state`, or everything when it's null or no longer valid. */
  changes(token: string, calendarId: string, state: string | null, timeZone: string): Promise<Changes>;
}

const CALENDAR_NAME = "Noirly Flow";
const CALENDAR_DESCRIPTION = "Your Noirly Flow tasks. Changes here go back to Flow.";

async function call(url: string, init: RequestInit & { token?: string; form?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers as Record<string, string> | undefined) };
  let body = init.body;
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  } else if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { ...init, headers, body, redirect: "error", signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
  if (!response.ok) {
    const message = data?.error?.message ?? data?.error_description ?? data?.error ?? `HTTP ${response.status}`;
    throw new CalendarApiError(response.status, typeof message === "string" ? message : `HTTP ${response.status}`);
  }
  return data as Record<string, unknown>;
}

/** The email in an ID token straight from the token endpoint (TLS to the issuer; no signature check needed here). */
function emailFromIdToken(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    const email = payload.email ?? payload.preferred_username;
    return typeof email === "string" ? email : null;
  } catch {
    return null;
  }
}

function tokensFrom(data: Record<string, unknown>, previousRefresh: string | null = null): Tokens {
  const seconds = Number(data.expires_in) || 3600;
  return {
    accessToken: String(data.access_token),
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : previousRefresh,
    expiresAt: new Date(Date.now() + seconds * 1000),
    email: emailFromIdToken(data.id_token),
  };
}

const env = (name: string, fallback: string) => process.env[name]?.trim().replace(/\/$/, "") || fallback;

// ── Google ────────────────────────────────────────────────────────────────

const google = {
  auth: () => env("GOOGLE_OAUTH_URL", "https://accounts.google.com"),
  token: () => env("GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token"),
  api: () => env("GOOGLE_CALENDAR_API_URL", "https://www.googleapis.com/calendar/v3"),
  clientId: () => process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() ?? "",
  secret: () => process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() ?? "",
};

/** Only calendars Flow itself creates: not the person's other calendars. */
const GOOGLE_SCOPE = "openid email https://www.googleapis.com/auth/calendar.app.created";

function googleEvent(event: EventInput) {
  const when = (value: string) => (event.allDay ? { date: value } : { dateTime: value, timeZone: event.timeZone });
  return { summary: event.title, description: event.description, start: when(event.start), end: when(event.end), reminders: { useDefault: false } };
}

type GoogleItem = { id: string; status?: string; summary?: string; updated?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } };

function fromGoogle(item: GoogleItem): RemoteEvent {
  const allDay = Boolean(item.start?.date);
  return {
    id: item.id,
    deleted: item.status === "cancelled",
    title: item.summary ?? "",
    allDay,
    start: (allDay ? item.start?.date : item.start?.dateTime) ?? "",
    end: (allDay ? item.end?.date : item.end?.dateTime) ?? "",
    updatedAt: item.updated ?? null,
  };
}

export const googleCalendar: CalendarApi = {
  id: "google",
  configured: () => Boolean(google.clientId() && google.secret()),
  authorizeUrl: ({ state, codeChallenge, redirectUri }) => `${google.auth()}/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: google.clientId(), redirect_uri: redirectUri, response_type: "code", scope: GOOGLE_SCOPE,
    access_type: "offline", prompt: "consent", state, code_challenge: codeChallenge, code_challenge_method: "S256",
  })}`,
  async exchange(code, codeVerifier, redirectUri) {
    return tokensFrom(await call(google.token(), { method: "POST", form: {
      code, code_verifier: codeVerifier, redirect_uri: redirectUri, grant_type: "authorization_code",
      client_id: google.clientId(), client_secret: google.secret(),
    } }));
  },
  async refresh(refreshToken) {
    return tokensFrom(await call(google.token(), { method: "POST", form: {
      refresh_token: refreshToken, grant_type: "refresh_token", client_id: google.clientId(), client_secret: google.secret(),
    } }), refreshToken);
  },
  async createCalendar(token, timeZone) {
    const data = await call(`${google.api()}/calendars`, { method: "POST", token, body: JSON.stringify({ summary: CALENDAR_NAME, description: CALENDAR_DESCRIPTION, timeZone }) });
    return String(data.id);
  },
  async calendarExists(token, calendarId) {
    try {
      await call(`${google.api()}/calendars/${encodeURIComponent(calendarId)}`, { token });
      return true;
    } catch (error) {
      if (error instanceof CalendarApiError && (error.status === 404 || error.status === 410)) return false;
      throw error;
    }
  },
  async deleteCalendar(token, calendarId) {
    await call(`${google.api()}/calendars/${encodeURIComponent(calendarId)}`, { method: "DELETE", token }).catch((error) => {
      if (!(error instanceof CalendarApiError && (error.status === 404 || error.status === 410))) throw error;
    });
  },
  async createEvent(token, calendarId, event) {
    const data = await call(`${google.api()}/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", token, body: JSON.stringify(googleEvent(event)) });
    return String(data.id);
  },
  async updateEvent(token, calendarId, eventId, event) {
    try {
      await call(`${google.api()}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "PUT", token, body: JSON.stringify(googleEvent(event)) });
    } catch (error) {
      if (error instanceof CalendarApiError && error.status === 410) throw new CalendarApiError(404, "Event is gone");
      throw error;
    }
  },
  async deleteEvent(token, calendarId, eventId) {
    await call(`${google.api()}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", token }).catch((error) => {
      if (!(error instanceof CalendarApiError && (error.status === 404 || error.status === 410))) throw error;
    });
  },
  async changes(token, calendarId, state) {
    const base = `${google.api()}/calendars/${encodeURIComponent(calendarId)}/events`;
    const events: RemoteEvent[] = [];
    let pageToken: string | undefined;
    let syncToken = state;
    for (let page = 0; page < 50; page += 1) {
      const params = new URLSearchParams({ showDeleted: "true", maxResults: "250" });
      if (syncToken) params.set("syncToken", syncToken);
      if (pageToken) params.set("pageToken", pageToken);
      let data: Record<string, unknown>;
      try {
        data = await call(`${base}?${params}`, { token });
      } catch (error) {
        // An expired sync token: start over with a full read.
        if (error instanceof CalendarApiError && error.status === 410 && syncToken) { syncToken = null; pageToken = undefined; events.length = 0; continue; }
        throw error;
      }
      for (const item of (data.items as GoogleItem[] | undefined) ?? []) events.push(fromGoogle(item));
      if (typeof data.nextPageToken === "string") { pageToken = data.nextPageToken; continue; }
      return { events, state: String(data.nextSyncToken ?? "") };
    }
    throw new CalendarApiError(500, "Too many pages of changes");
  },
};

// ── Outlook (Microsoft Graph) ─────────────────────────────────────────────

const ms = {
  login: () => env("MICROSOFT_LOGIN_URL", "https://login.microsoftonline.com/common/oauth2/v2.0"),
  graph: () => env("MICROSOFT_GRAPH_URL", "https://graph.microsoft.com/v1.0"),
  clientId: () => process.env.MICROSOFT_CALENDAR_CLIENT_ID?.trim() ?? "",
  secret: () => process.env.MICROSOFT_CALENDAR_CLIENT_SECRET?.trim() ?? "",
};

const MS_SCOPE = "openid email offline_access Calendars.ReadWrite";
/** How far the change feed looks: 30 days back, a year ahead. */
const WINDOW_BACK_DAYS = 30;
const WINDOW_AHEAD_DAYS = 365;

function graphEvent(event: EventInput) {
  if (event.allDay) {
    return {
      subject: event.title, body: { contentType: "text", content: event.description }, isAllDay: true, isReminderOn: false,
      start: { dateTime: `${event.start}T00:00:00`, timeZone: event.timeZone },
      end: { dateTime: `${event.end}T00:00:00`, timeZone: event.timeZone },
    };
  }
  const utc = (iso: string) => new Date(iso).toISOString().slice(0, 19);
  return {
    subject: event.title, body: { contentType: "text", content: event.description }, isAllDay: false, isReminderOn: false,
    start: { dateTime: utc(event.start), timeZone: "UTC" }, end: { dateTime: utc(event.end), timeZone: "UTC" },
  };
}

type GraphItem = {
  id: string; "@removed"?: unknown; subject?: string; isAllDay?: boolean; lastModifiedDateTime?: string;
  start?: { dateTime?: string; timeZone?: string }; end?: { dateTime?: string; timeZone?: string };
};

function fromGraph(item: GraphItem, timeZone: string): RemoteEvent {
  if (item["@removed"]) return { id: item.id, deleted: true, title: "", allDay: false, start: "", end: "", updatedAt: null };
  const allDay = Boolean(item.isAllDay);
  // Times come back as wall-clock readings in the zone they name (the Prefer header's, normally).
  const instant = (value?: { dateTime?: string; timeZone?: string }) =>
    value?.dateTime ? wallToInstant(value.dateTime, value.timeZone || timeZone).toISOString() : "";
  return {
    id: item.id,
    deleted: false,
    title: item.subject ?? "",
    allDay,
    start: allDay ? (item.start?.dateTime ?? "").slice(0, 10) : instant(item.start),
    end: allDay ? (item.end?.dateTime ?? "").slice(0, 10) : instant(item.end),
    updatedAt: item.lastModifiedDateTime ?? null,
  };
}

export const outlookCalendar: CalendarApi = {
  id: "outlook",
  configured: () => Boolean(ms.clientId() && ms.secret()),
  authorizeUrl: ({ state, codeChallenge, redirectUri }) => `${ms.login()}/authorize?${new URLSearchParams({
    client_id: ms.clientId(), redirect_uri: redirectUri, response_type: "code", response_mode: "query", scope: MS_SCOPE,
    prompt: "select_account", state, code_challenge: codeChallenge, code_challenge_method: "S256",
  })}`,
  async exchange(code, codeVerifier, redirectUri) {
    return tokensFrom(await call(`${ms.login()}/token`, { method: "POST", form: {
      code, code_verifier: codeVerifier, redirect_uri: redirectUri, grant_type: "authorization_code", scope: MS_SCOPE,
      client_id: ms.clientId(), client_secret: ms.secret(),
    } }));
  },
  async refresh(refreshToken) {
    return tokensFrom(await call(`${ms.login()}/token`, { method: "POST", form: {
      refresh_token: refreshToken, grant_type: "refresh_token", scope: MS_SCOPE, client_id: ms.clientId(), client_secret: ms.secret(),
    } }), refreshToken);
  },
  async createCalendar(token) {
    const data = await call(`${ms.graph()}/me/calendars`, { method: "POST", token, body: JSON.stringify({ name: CALENDAR_NAME }) });
    return String(data.id);
  },
  async calendarExists(token, calendarId) {
    try {
      await call(`${ms.graph()}/me/calendars/${encodeURIComponent(calendarId)}`, { token });
      return true;
    } catch (error) {
      if (error instanceof CalendarApiError && error.status === 404) return false;
      throw error;
    }
  },
  async deleteCalendar(token, calendarId) {
    await call(`${ms.graph()}/me/calendars/${encodeURIComponent(calendarId)}`, { method: "DELETE", token }).catch((error) => {
      if (!(error instanceof CalendarApiError && error.status === 404)) throw error;
    });
  },
  async createEvent(token, calendarId, event) {
    const data = await call(`${ms.graph()}/me/calendars/${encodeURIComponent(calendarId)}/events`, { method: "POST", token, body: JSON.stringify(graphEvent(event)) });
    return String(data.id);
  },
  async updateEvent(token, _calendarId, eventId, event) {
    await call(`${ms.graph()}/me/events/${encodeURIComponent(eventId)}`, { method: "PATCH", token, body: JSON.stringify(graphEvent(event)) });
  },
  async deleteEvent(token, _calendarId, eventId) {
    await call(`${ms.graph()}/me/events/${encodeURIComponent(eventId)}`, { method: "DELETE", token }).catch((error) => {
      if (!(error instanceof CalendarApiError && error.status === 404)) throw error;
    });
  },
  async changes(token, calendarId, state, timeZone) {
    const prefer = { Prefer: `outlook.timezone="${timeZone}", odata.maxpagesize=100` };
    const start = new Date(Date.now() - WINDOW_BACK_DAYS * 86_400_000).toISOString();
    const end = new Date(Date.now() + WINDOW_AHEAD_DAYS * 86_400_000).toISOString();
    const fresh = `${ms.graph()}/me/calendars/${encodeURIComponent(calendarId)}/calendarView/delta?${new URLSearchParams({ startDateTime: start, endDateTime: end })}`;
    // A saved delta link must point back at Graph, never anywhere else.
    let url = state && state.startsWith(`${ms.graph()}/`) ? state : fresh;
    const events: RemoteEvent[] = [];
    for (let page = 0; page < 50; page += 1) {
      let data: Record<string, unknown>;
      try {
        data = await call(url, { token, headers: prefer });
      } catch (error) {
        if (error instanceof CalendarApiError && (error.status === 410 || error.status === 400) && url !== fresh) { url = fresh; events.length = 0; continue; }
        throw error;
      }
      for (const item of (data.value as GraphItem[] | undefined) ?? []) events.push(fromGraph(item, timeZone));
      if (typeof data["@odata.nextLink"] === "string") { url = data["@odata.nextLink"]; continue; }
      return { events, state: String(data["@odata.deltaLink"] ?? "") };
    }
    throw new CalendarApiError(500, "Too many pages of changes");
  },
};

export const CALENDAR_APIS: Record<SyncProviderId, CalendarApi> = { google: googleCalendar, outlook: outlookCalendar };
