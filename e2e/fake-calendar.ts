import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/**
 * A stand-in for Google Calendar and Microsoft Graph, just the calls Flow
 * makes, so calendar sync can be tested end to end without real accounts.
 * Flow's e2e server is pointed at it by the GOOGLE_* / MICROSOFT_* URLs in env.ts.
 */

type Stored = { id: string; deleted: boolean; seq: number; updated: string; body: Record<string, unknown> };
type Calendar = { id: string; provider: "google" | "outlook"; events: Map<string, Stored> };

export class FakeCalendar {
  calendars = new Map<string, Calendar>();
  private seq = 0;
  private server: Server | null = null;

  constructor(readonly port: number) {}

  /** The one calendar Flow made for a provider (tests connect one account each). */
  calendar(provider: "google" | "outlook") {
    return [...this.calendars.values()].find((c) => c.provider === provider) ?? null;
  }

  liveEvents(provider: "google" | "outlook") {
    return [...(this.calendar(provider)?.events.values() ?? [])].filter((e) => !e.deleted);
  }

  /** What a person does in their calendar app. */
  editEvent(provider: "google" | "outlook", id: string, change: Record<string, unknown>) {
    const event = this.calendar(provider)!.events.get(id)!;
    Object.assign(event.body, change);
    this.touch(event);
  }

  deleteEvent(provider: "google" | "outlook", id: string) {
    const event = this.calendar(provider)!.events.get(id)!;
    event.deleted = true;
    this.touch(event);
  }

  private touch(event: Stored) {
    event.seq = ++this.seq;
    // A moment later than anything Flow wrote, as a real person's edit would be.
    event.updated = new Date(Date.now() + 1000).toISOString();
  }

  async start() {
    this.server = createServer((req, res) => void this.handle(req, res).catch(() => this.send(res, 500, { error: "fake failed" })));
    await new Promise<void>((resolve) => this.server!.listen(this.port, "127.0.0.1", resolve));
  }

  async stop() {
    await new Promise((resolve) => this.server?.close(resolve));
  }

  private send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(body === undefined ? "" : JSON.stringify(body));
  }

  private async body(req: IncomingMessage) {
    let text = "";
    for await (const chunk of req) text += chunk;
    return text;
  }

  private idToken(claims: Record<string, string>) {
    const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${part({ alg: "none" })}.${part(claims)}.sig`;
  }

  private store(calendar: Calendar, body: Record<string, unknown>) {
    const id = `${calendar.provider === "google" ? "gev" : "msev"}-${++this.seq}`;
    calendar.events.set(id, { id, deleted: false, seq: this.seq, updated: new Date().toISOString(), body });
    return id;
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
    const path = url.pathname;
    const method = req.method ?? "GET";
    const authed = (req.headers.authorization ?? "").startsWith("Bearer ");

    // ── Sign-in: straight back to Flow with a code ──
    if (path === "/google/o/oauth2/v2/auth" || path === "/ms/oauth2/v2.0/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri")!);
      back.searchParams.set("code", path.startsWith("/google") ? "google-code" : "ms-code");
      back.searchParams.set("state", url.searchParams.get("state")!);
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (path === "/google/token" || path === "/ms/oauth2/v2.0/token") {
      const form = new URLSearchParams(await this.body(req));
      const google = path.startsWith("/google");
      if (form.get("grant_type") === "authorization_code" && !form.get("code_verifier")) return this.send(res, 400, { error: "invalid_grant" });
      return this.send(res, 200, {
        access_token: `${google ? "g" : "ms"}-access-${++this.seq}`,
        refresh_token: `${google ? "g" : "ms"}-refresh`,
        expires_in: 3600,
        id_token: this.idToken(google ? { email: "sam@gmail.test" } : { preferred_username: "sam@outlook.test" }),
      });
    }
    if (!authed) return this.send(res, 401, { error: { message: "No token" } });

    // ── Google Calendar ──
    let m = /^\/google\/calendar\/v3\/calendars(?:\/([^/]+))?(?:\/events(?:\/([^/]+))?)?$/.exec(path);
    if (m) {
      const [, calendarId, eventId] = m;
      if (!calendarId && method === "POST") {
        const id = `gcal-${++this.seq}`;
        this.calendars.set(id, { id, provider: "google", events: new Map() });
        return this.send(res, 200, { id });
      }
      const calendar = calendarId ? this.calendars.get(decodeURIComponent(calendarId)) : undefined;
      if (!calendar) return this.send(res, 404, { error: { message: "Not found" } });
      if (!path.includes("/events")) {
        if (method === "DELETE") { this.calendars.delete(calendar.id); return this.send(res, 204); }
        return this.send(res, 200, { id: calendar.id });
      }
      if (!eventId && method === "POST") return this.send(res, 200, { id: this.store(calendar, JSON.parse(await this.body(req))) });
      if (!eventId && method === "GET") {
        const since = Number(url.searchParams.get("syncToken") ?? -1);
        const items = [...calendar.events.values()].filter((e) => e.seq > since).map((e) => ({
          id: e.id, status: e.deleted ? "cancelled" : "confirmed", updated: e.updated, ...e.body,
        }));
        return this.send(res, 200, { items, nextSyncToken: String(this.seq) });
      }
      const event = calendar.events.get(decodeURIComponent(eventId!));
      if (!event) return this.send(res, 404, { error: { message: "Not found" } });
      if (event.deleted) return this.send(res, 410, { error: { message: "Deleted" } });
      if (method === "PUT") { event.body = JSON.parse(await this.body(req)); event.seq = ++this.seq; event.updated = new Date().toISOString(); return this.send(res, 200, { id: event.id }); }
      if (method === "DELETE") { event.deleted = true; event.seq = ++this.seq; return this.send(res, 204); }
    }

    // ── Microsoft Graph ──
    if (path === "/ms/v1.0/me/calendars" && method === "POST") {
      const id = `mscal-${++this.seq}`;
      this.calendars.set(id, { id, provider: "outlook", events: new Map() });
      return this.send(res, 201, { id });
    }
    m = /^\/ms\/v1\.0\/me\/calendars\/([^/]+)(\/events|\/calendarView\/delta)?$/.exec(path);
    if (m) {
      const calendar = this.calendars.get(decodeURIComponent(m[1]!));
      if (!calendar) return this.send(res, 404, { error: { message: "Not found" } });
      if (!m[2]) {
        if (method === "DELETE") { this.calendars.delete(calendar.id); return this.send(res, 204); }
        return this.send(res, 200, { id: calendar.id });
      }
      if (m[2] === "/events" && method === "POST") return this.send(res, 201, { id: this.store(calendar, JSON.parse(await this.body(req))) });
      const since = Number(url.searchParams.get("$deltatoken") ?? -1);
      const value = [...calendar.events.values()].filter((e) => e.seq > since).map((e) => (e.deleted
        ? { id: e.id, "@removed": { reason: "deleted" } }
        : { id: e.id, lastModifiedDateTime: e.updated, ...e.body }));
      return this.send(res, 200, { value, "@odata.deltaLink": `http://127.0.0.1:${this.port}/ms/v1.0/me/calendars/${calendar.id}/calendarView/delta?$deltatoken=${this.seq}` });
    }
    m = /^\/ms\/v1\.0\/me\/events\/([^/]+)$/.exec(path);
    if (m) {
      const event = [...this.calendars.values()].flatMap((c) => [...c.events.values()]).find((e) => e.id === decodeURIComponent(m![1]!));
      if (!event || event.deleted) return this.send(res, 404, { error: { message: "Not found" } });
      if (method === "PATCH") { Object.assign(event.body, JSON.parse(await this.body(req))); event.seq = ++this.seq; event.updated = new Date().toISOString(); return this.send(res, 200, { id: event.id }); }
      if (method === "DELETE") { event.deleted = true; event.seq = ++this.seq; return this.send(res, 204); }
    }
    return this.send(res, 404, { error: { message: `Fake has no ${method} ${path}` } });
  }
}
