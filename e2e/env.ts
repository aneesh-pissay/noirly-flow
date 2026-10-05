/**
 * The environment the e2e server runs with. Values set here win over
 * `.env.local` (Next only fills in variables that are not already defined —
 * an empty string counts as defined, which is how realtime is switched off).
 */
export const E2E_PORT = 3102;
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

/** Test-only secret: the server signs sessions with it, global-setup mints them. */
export const E2E_AUTH_SECRET = "noirly-flow-e2e-secret-not-for-production-use-0123456789";

export const E2E_MONGODB_URI =
  process.env.E2E_MONGODB_URI ?? "mongodb://127.0.0.1:27017/noirly-flow-e2e";

export const E2E_ENV: Record<string, string> = {
  NEXT_DIST_DIR: ".next-e2e",
  MONGODB_URI: E2E_MONGODB_URI,
  AUTH_SECRET: E2E_AUTH_SECRET,
  AUTH_URL: E2E_BASE_URL,
  NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
  // Realtime off: no WebSocket from the browser, no publishes from the server.
  NEXT_PUBLIC_REALTIME_WS_URL: "",
  REALTIME_INTERNAL_URL: "",
};

/** Auth.js cookie name under `next start` over http (no __Secure- prefix). */
export const SESSION_COOKIE = "authjs.session-token";

export const USERS = {
  owner: { id: "e2e-owner", name: "Olive Owner", email: "owner@e2e.test" },
  member: { id: "e2e-member", name: "Milo Member", email: "member@e2e.test" },
  /** Edits their own profile — kept apart so parallel tests never fight over it. */
  editor: { id: "e2e-editor", name: "Edie Editor", email: "editor@e2e.test" },
} as const;

export type E2EUser = keyof typeof USERS;

export const storageStatePath = (user: E2EUser) => `e2e/.auth/${user}.json`;
