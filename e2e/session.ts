import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { E2E_AUTH_SECRET, SESSION_COOKIE, USERS, type E2EUser } from "./env";

/**
 * Mints an Auth.js session cookie value for a test user — the JWT the Identity
 * OIDC callback would produce, including a fresh session id (`sid`) as a real
 * sign-in gets. Each call is a separate session that signs out on its own.
 */
export async function mintSession(user: E2EUser | { id: string; name: string; email: string }) {
  const u = typeof user === "string" ? USERS[user] : user;
  return encode({
    secret: E2E_AUTH_SECRET,
    salt: SESSION_COOKIE,
    token: {
      sub: u.id,
      identitySub: u.id,
      name: u.name,
      email: u.email,
      picture: null,
      sid: randomUUID(),
    },
  });
}

/** Playwright storage state holding one freshly minted session. */
export async function sessionStorageState(user: E2EUser) {
  return {
    cookies: [
      {
        name: SESSION_COOKIE,
        value: await mintSession(user),
        domain: "localhost",
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}
