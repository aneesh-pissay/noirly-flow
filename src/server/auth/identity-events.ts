import { createRemoteJWKSet, jwtVerify } from "jose";
import { identityIssuer } from "@/src/server/auth/identity-userinfo";

/**
 * Verifies a Security Event Token from Noirly Identity: signed with its OIDC
 * key, `aud` = this app's client id, carrying `event`. Returns the `sub`
 * (a user id or space id, depending on the event); throws if anything's off.
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function identityKeys() {
  jwks ??= createRemoteJWKSet(new URL(`${identityIssuer()}/.well-known/jwks.json`));
  return jwks;
}

export class InvalidEventError extends Error {}

export async function verifyIdentityEvent(token: string, audience: string, event: string): Promise<string> {
  const { payload } = await jwtVerify(token, identityKeys(), {
    issuer: identityIssuer(),
    audience,
    typ: "secevent+jwt",
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat", "sub", "jti"],
    maxTokenAge: "5 minutes",
  });
  const events = payload.events as Record<string, unknown> | undefined;
  if (!payload.sub || !events || !(event in events)) throw new InvalidEventError("invalid_event");
  return payload.sub;
}
