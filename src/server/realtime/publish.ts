type PublishInput = {
  channel: string;
  event: string;
  data: unknown;
  ephemeral?: boolean;
};

function isValidUrl(base: string): boolean {
  try {
    new URL(base);
    return true;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget fan-out to noirly-realtime. Callers don't await it, so a
 * slow or unreachable realtime server never delays the API response; failures
 * are logged. (It used to skip localhost whenever NODE_ENV was production,
 * which silently disabled realtime for `next start` against a local server.)
 */
export async function publishRealtime(input: PublishInput): Promise<void> {
  const base = process.env.REALTIME_INTERNAL_URL;
  const secret =
    process.env.REALTIME_INTERNAL_SECRET ?? process.env.REALTIME_JWT_SECRET;
  if (!base || !secret || !isValidUrl(base)) return;

  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/internal/publish`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(800),
    });
    if (!res.ok) {
      console.error("realtime publish failed", res.status);
    }
  } catch (error) {
    console.error("realtime publish error", error);
  }
}
