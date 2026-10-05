import { test as base } from "@playwright/test";
import { expect, test } from "./fixtures";
import { SESSION_COOKIE, USERS } from "./env";
import { mintSession } from "./session";

base.describe("signed out", () => {
  base("landing page is public and offers Noirly Login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Built for how work actually moves")).toBeVisible();
  });

  base("app routes redirect to /login", async ({ page }) => {
    for (const path of ["/inbox", "/settings", "/w/000000000000000000000000"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
    await expect(page.getByText("Opens Identity in a secure popup")).toBeVisible();
  });

  base("an invite link keeps its destination through login", async ({ page }) => {
    await page.goto("/invite/some-token-123");
    await expect(page).toHaveURL(/\/login\?next=%2Finvite%2Fsome-token-123$/);
  });

  base("API answers 401 instead of redirecting", async ({ request }) => {
    const response = await request.get("/api/workspaces");
    expect(response.status()).toBe(401);
  });
});

test.describe("signed in", () => {
  test("first visit provisions a Personal workspace with an Inbox board", async ({ page }) => {
    await page.goto("/");
    // Signed-in "/" → /inbox → personal workspace.
    await expect(page).toHaveURL(/\/w\/[a-f0-9]{24}/);
    // Exactly one: first-login bootstrap must not create duplicates.
    await expect(page.getByRole("link", { name: /^Personal/ })).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    // The signed-in user is shown in the sidebar footer.
    await expect(page.getByText(USERS.owner.email)).toBeVisible();
  });

  test("/login bounces a signed-in user into the app", async ({ page }) => {
    await page.goto("/login");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("/api/me returns the session user", async ({ page }) => {
    const response = await page.request.get("/api/me");
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(JSON.stringify(body)).toContain(USERS.owner.email);
  });
});

// Regression: first-login bootstrap used to be check-then-create, so
// concurrent first requests raced — losers answered 500 on the unique
// identitySub index, and late ones each made another "Personal" workspace.
base("concurrent first requests for a new user all succeed with one Personal workspace", async ({ request }) => {
  const sub = `race-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const value = await mintSession({ id: sub, name: "Race User", email: `${sub}@e2e.test` });
  const headers = { cookie: `${SESSION_COOKIE}=${value}` };

  const responses = await Promise.all(
    Array.from({ length: 8 }, () => request.get("/api/workspaces", { headers })),
  );
  expect(responses.map((r) => r.status())).toEqual(Array(8).fill(200));

  const { workspaces } = await (await request.get("/api/workspaces", { headers })).json();
  expect(workspaces.filter((w: { kind: string }) => w.kind === "personal")).toHaveLength(1);
});
