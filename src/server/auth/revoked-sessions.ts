import { withDb } from "@/src/server/db/mongodb";
import { RevokedSession } from "@/src/server/models/RevokedSession";

/** Auth.js default session lifetime — a revoked sid can't outlive this. */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 10_000;

/**
 * Only "revoked" answers are cached — they never change. "Not revoked" is
 * always asked of the database: Next bundles the proxy and the routes
 * separately, so in-memory state is not shared between them, and a cached
 * "still valid" in one bundle would keep accepting a session another bundle
 * had just signed out.
 */
const revoked = new Set<string>();

function markRevoked(sid: string) {
  if (revoked.size >= CACHE_LIMIT) revoked.clear();
  revoked.add(sid);
}

export async function revokeSession(sid: string): Promise<void> {
  markRevoked(sid);
  try {
    await withDb(() =>
      RevokedSession.updateOne(
        { sid },
        { $setOnInsert: { sid, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) } },
        { upsert: true },
      ),
    );
  } catch (error) {
    // Two sign-outs of the same session can race on the unique index.
    if ((error as { code?: unknown }).code !== 11000) throw error;
  }
}

export async function isSessionRevoked(sid: string): Promise<boolean> {
  if (revoked.has(sid)) return true;
  const hit = await withDb(() => RevokedSession.exists({ sid }));
  if (hit) markRevoked(sid);
  return Boolean(hit);
}
