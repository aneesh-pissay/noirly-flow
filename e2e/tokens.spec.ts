import type { APIRequestContext } from "@playwright/test";
import { expect, test, uid } from "./fixtures";

test.describe("API tokens", () => {
  test("a token made in Settings reads the API, respects its scope, and stops when revoked", async ({ page, team, playwright }) => {
    const id = uid();
    await page.goto("/settings");
    const section = page.getByRole("region", { name: "API tokens" });
    await section.getByLabel("Token name").fill(`Reader ${id}`);
    await section.getByRole("button", { name: "Create token" }).click();
    const reader = await section.locator("#new-api-token").inputValue();
    expect(reader).toMatch(/^nfp_r_[\w-]{40,}$/);
    await expect(section.getByRole("list", { name: "API tokens" })).toContainText(`Reader ${id}`);
    await page.screenshot({ path: "test-results/api-tokens.png", fullPage: true });

    // A context with no cookies: only the token signs in.
    const origin = new URL(page.url()).origin;
    const as = (token: string) => playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
    const read = await as(reader);
    const workspaces = await read.get("/api/workspaces");
    expect(workspaces.ok()).toBe(true);
    expect(JSON.stringify(await workspaces.json())).toContain(team.workspace.id);
    const blocked = await read.post(`/api/workspaces/${team.workspace.id}/tasks`, { data: { title: `Nope ${id}` } });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).error).toBe("read_only_token");

    // A write token can change things, but not account-level settings or tokens.
    const made = await (await page.request.post("/api/me/tokens", { data: { name: `Writer ${id}`, scope: "write", days: 30 } })).json();
    const write = await as(made.token);
    const created = await write.post(`/api/workspaces/${team.workspace.id}/tasks`, { data: { title: `From script ${id}`, projectId: team.project.id } });
    expect(created.status()).toBe(201);
    const { task } = await created.json();
    expect((await write.patch(`/api/tasks/${task.id}`, { data: { priority: "high" } })).ok()).toBe(true);
    expect((await write.get("/api/me/tokens")).status()).toBe(403);
    expect((await write.post("/api/me/tokens", { data: { name: "More", scope: "write", days: 0 } })).status()).toBe(403);
    expect((await write.post("/api/me/calendar-feed")).status()).toBe(403);

    // Editing the scope letter, or a made-up token, doesn't get in.
    const tampered = await as(reader.replace(/^nfp_r_/, "nfp_w_"));
    expect((await tampered.get("/api/workspaces")).status()).toBe(401);
    const fake = await as(`nfp_w_${"x".repeat(43)}`);
    expect((await fake.get("/api/workspaces")).status()).toBe(401);

    // Revoking from Settings stops it at once; use shows on the list.
    await page.reload();
    const row = section.getByRole("listitem").filter({ hasText: `Reader ${id}` });
    await expect(row).toContainText("Used ");
    page.once("dialog", (prompt) => void prompt.accept());
    await row.getByRole("button", { name: `Revoke token Reader ${id}` }).click();
    await expect(row).toHaveCount(0);
    expect((await read.get("/api/workspaces")).status()).toBe(401);

    await Promise.all([read, write, tampered, fake].map((context: APIRequestContext) => context.dispose()));
  });
});
