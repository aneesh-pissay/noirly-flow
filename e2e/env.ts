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

/** Where the e2e server writes invite emails (see src/server/mail/invite-mail.ts). */
export const E2E_INVITE_OUTBOX = "test-results/invite-outbox";

/** Where the e2e server writes task emails (assignments, reminders). */
export const E2E_TASK_OUTBOX = "test-results/task-outbox";

/** Test-only cron secret, so tests can call /api/cron/* directly. */
export const E2E_CRON_SECRET = "noirly-flow-e2e-cron-secret-0123456789abcdef";

export const E2E_ENV: Record<string, string> = {
  NEXT_DIST_DIR: ".next-e2e",
  MONGODB_URI: E2E_MONGODB_URI,
  AUTH_SECRET: E2E_AUTH_SECRET,
  // No live Identity calls: test sessions are minted locally with the test secret.
  AUTH_NOIRLY_ISSUER: "https://identity.e2e.invalid",
  // Webhooks check their audience against this; spaces calls fail (no Identity).
  AUTH_NOIRLY_CLIENT_ID: "noirly-flow-e2e",
  AUTH_NOIRLY_CLIENT_SECRET: "noirly-flow-e2e-client-secret",
  AUTH_URL: E2E_BASE_URL,
  NEXT_PUBLIC_APP_URL: E2E_BASE_URL,
  // Realtime off: no WebSocket from the browser, no publishes from the server.
  NEXT_PUBLIC_REALTIME_WS_URL: "",
  REALTIME_INTERNAL_URL: "",
  // Invite emails land here as files instead of going out over SMTP.
  INVITE_EMAIL_OUTBOX: E2E_INVITE_OUTBOX,
  MENTION_EMAIL_OUTBOX: "test-results/mention-outbox",
  TASK_EMAIL_OUTBOX: E2E_TASK_OUTBOX,
  // Every test shares one IP and two accounts; the normal 300 a minute trips mid-run.
  API_RATE_LIMIT_PER_MINUTE: "100000",
  // Webhook specs post to a receiver on 127.0.0.1.
  FLOW_WEBHOOKS_ALLOW_LOCALHOST: "1",
  // Lets tests run the cron routes (reminder sweep) on demand.
  CRON_SECRET: E2E_CRON_SECRET,
  // No R2 in tests: attachments go to a local folder.
  ATTACHMENTS_LOCAL_DIR: "test-results/attachments",
  // Empty values prevent Next from inheriting live R2 credentials from .env.local.
  R2_ACCOUNT_ID: "",
  R2_ACCESS_KEY_ID: "",
  R2_SECRET_ACCESS_KEY: "",
  R2_BUCKET_NAME: "",
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
