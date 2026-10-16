import { readLimitedText } from "@/src/server/security/body";
import { InvalidEventError, verifyIdentityEvent } from "@/src/server/auth/identity-events";
import { syncAllLinkedTo } from "@/src/server/spaces/sync";

/**
 * Noirly Identity calls this when a space changes (members, roles, name, or
 * it was deleted). The notice only names the space; Flow re-reads it and
 * updates every workspace linked to it. Re-syncing is idempotent, so a replay
 * does no harm. Register it in Identity: SPACE_WEBHOOKS=<client id>=<this URL>.
 */

const SPACE_CHANGED_EVENT = "https://noirly.dev/events/space-changed";

export async function POST(request: Request) {
  const audience = process.env.AUTH_NOIRLY_CLIENT_ID;
  if (!audience) {
    return Response.json({ error: "not_configured" }, { status: 503 });
  }

  let spaceId: string;
  try {
    const token = (await readLimitedText(request, 16384)).trim();
    spaceId = await verifyIdentityEvent(token, audience, SPACE_CHANGED_EVENT);
  } catch (error) {
    if (error instanceof InvalidEventError) return Response.json({ error: "invalid_event" }, { status: 400 });
    return Response.json({ error: "invalid_token" }, { status: 401 });
  }

  try {
    const workspaces = await syncAllLinkedTo(spaceId);
    return Response.json({ ok: true, workspaces });
  } catch {
    console.error("Flow space sync failed");
    // Linked workspaces also re-sync when opened, so this only delays.
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
