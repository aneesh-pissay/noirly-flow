/**
 * A dev server for working on the Docs against the isolated e2e database —
 * no Identity, no real data. Signs in as the e2e owner via a minted session.
 *
 *   npx tsx docs-pipeline/dev.ts        then open http://localhost:3103/docs
 *
 * The session cookie is written to test-results/docs-dev-session.txt; set it as
 * `authjs.flow.session-token` (path /) in the browser, or let the capture tools do it.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { E2E_AUTH_SECRET, E2E_ENV, USERS } from "../e2e/env";

const PORT = 3103;
const origin = `http://localhost:${PORT}`;
/** `next dev` uses Flow's development cookie name (see auth.ts), which is also the JWT salt. */
export const DEV_SESSION_COOKIE = "authjs.flow.session-token";

async function main() {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/docs-dev-session.txt", await encode({
    secret: E2E_AUTH_SECRET,
    salt: DEV_SESSION_COOKIE,
    token: { sub: USERS.owner.id, identitySub: USERS.owner.id, name: USERS.owner.name, email: USERS.owner.email, picture: null, sid: randomUUID() },
  }));

  const child = spawn("pnpm", ["exec", "next", "dev", "--port", String(PORT)], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...E2E_ENV, NEXT_DIST_DIR: ".next-docs-dev", AUTH_URL: origin, NEXT_PUBLIC_APP_URL: origin },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

void main();
