import { renderFeed } from "@/src/server/calendar/feed";

type Params = { params: Promise<{ file: string }> };

/**
 * GET /api/calendar/<token>.ics — the subscription feed calendar apps poll.
 * No session: the unguessable token is the credential, so an unknown or
 * revoked one gets the same 404 as a malformed one.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { file } = await params;
    const token = file.endsWith(".ics") ? file.slice(0, -4) : file;
    const body = await renderFeed(token);
    if (body === null) return new Response("Not found", { status: 404 });
    return new Response(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="noirly-flow.ics"',
        "Cache-Control": "private, max-age=300",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch {
    console.error("Calendar feed failed");
    return new Response("Calendar unavailable", { status: 503 });
  }
}
