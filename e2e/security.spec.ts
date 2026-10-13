import { test as base, expect } from "@playwright/test";
import { SESSION_COOKIE } from "./env";
import { mintSession } from "./session";

base("cookie mutations require CSRF and reject foreign origins", async ({ request }) => {
  const cookie = `${SESSION_COOKIE}=${await mintSession("owner")}`;
  const missing = await request.post("/api/workspaces", { headers: { cookie }, data: { name: "must-not-create" } });
  expect(missing.status()).toBe(403);
  const foreign = await request.post("/api/workspaces", { headers: { cookie, "X-Noirly-CSRF": "1", origin: "https://attacker.invalid" }, data: { name: "must-not-create" } });
  expect(foreign.status()).toBe(403);
  const invalidBearer = await request.post("/api/workspaces", { headers: { cookie, authorization: "Bearer invalid" }, data: { name: "must-not-create" } });
  expect(invalidBearer.status()).toBe(401);
});

base("source maps are blocked and page CSP uses a fresh nonce", async ({ request }) => {
  expect((await request.get("/_next/static/security-probe.js.map")).status()).toBe(404);
  const first = await request.get("/login");
  const second = await request.get("/login");
  const policy = first.headers()["content-security-policy"];
  expect(policy).toContain("script-src-attr 'none'");
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).not.toEqual(second.headers()["content-security-policy"]);
});
