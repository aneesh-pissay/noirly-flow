import { createTask, expect, test, uid, waitForTasks } from "./fixtures";
import { USERS, storageStatePath } from "./env";
import { sessionStorageState } from "./session";

test.describe("settings", () => {
  test.use({ storageState: storageStatePath("editor") });

  test("Flow profile saves and survives a reload", async ({ page }) => {
    // The form fills itself from /api/me when it arrives and overwrites anything
    // typed before then — wait for it, as a person would. (Known UX gap: early
    // typing is silently discarded and the save still says "Saved".)
    const profileLoaded = page.waitForResponse((r) => r.url().endsWith("/api/me") && r.request().method() === "GET");
    await page.goto("/settings");
    await profileLoaded;
    const titleValue = `Lead ${uid()}`;
    await page.getByLabel("Title").fill(titleValue);
    await page.getByLabel("Timezone").selectOption({ label: "Tokyo" });
    await page.getByLabel("Bio").fill("Prefers async updates.");
    await page.getByRole("button", { name: "Save Flow profile" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Title")).toHaveValue(titleValue);
    await expect(page.getByLabel("Bio")).toHaveValue("Prefers async updates.");
    await expect(page.getByText(USERS.editor.email).first()).toBeVisible();
  });
});

test.describe("command palette", () => {
  test("creates a task from the search box", async ({ page, team }) => {
    await page.goto(team.url);
    await waitForTasks(page);
    const title = `From palette ${uid()}`;

    await page.getByRole("button", { name: "Open search" }).click();
    const input = page.getByPlaceholder("Create a task, search, or jump…");
    await input.fill(title);
    await page.getByText(`Create task “${title}”`).click();

    await expect(input).toBeHidden();
    await expect
      .poll(async () => {
        const { tasks } = await (await page.request.get(`/api/workspaces/${team.workspace.id}/tasks`)).json();
        return tasks.some((t: { title: string }) => t.title === title);
      })
      .toBe(true);
  });

  test("finds a task and opens it", async ({ page, team }) => {
    const title = `Searchable ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await page.goto(team.url);
    await waitForTasks(page);

    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByPlaceholder("Create a task, search, or jump…");
    await expect(input).toBeVisible();
    await input.fill(title);
    // Wait for the search hit itself — the "Create task / project" items match first.
    await page.getByRole("option", { name: new RegExp(`^${title}`) }).click();
    await expect(page).toHaveURL(new RegExp(`task=${task.id}`));
  });

  test("jumps to Settings", async ({ page }) => {
    await page.goto("/inbox");
    await page.getByRole("button", { name: "Open search" }).click();
    await page.getByPlaceholder("Create a task, search, or jump…").fill("settings");
    await page.getByRole("option", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
  });
});

test.describe("activity", () => {
  test("records task changes and exports CSV", async ({ page, team }) => {
    const title = `Audited ${uid()}`;
    await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await page.goto(`/w/${team.workspace.id}/activity`);
    await expect(page.getByText(`${USERS.owner.name} created a task “${title}”`)).toBeVisible();

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.csv$/);
    const { readFile } = await import("node:fs/promises");
    const csv = await readFile((await file.path())!, "utf8");
    expect(csv).toContain("task.created");
    expect(csv).toContain(title);
  });
});

test.describe("sign out", () => {
  // Each test signs out a session of its own: sign-out now ends the session on
  // the server, so using the shared owner session would sign out every test.
  test.use({
    storageState: async ({}, provide) => provide(await sessionStorageState("owner")),
  });

  test("ends the session", async ({ page }) => {
    await page.goto("/inbox");
    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/login$/);

    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/login$/);
  });

  // Regression: Auth.js re-issues the JWT session cookie on every response,
  // prefetches included. A prefetch sent before sign-out that answered after
  // it used to set the cookie again and sign the user straight back in. This
  // replays exactly that; the session is now revoked server-side, so the
  // revived cookie is refused.
  test("stays signed out when a prefetch lands after sign-out", async ({ page }) => {
    await page.goto("/inbox");
    await page.waitForLoadState("networkidle");
    const before = (await page.context().cookies()).find((c) => c.name === "authjs.session-token")!;

    await page.getByRole("button", { name: /sign out/i }).click();
    await page.waitForURL(/\/login$/);

    // The late prefetch: page.request shares the browser cookie jar, so its
    // Set-Cookie lands exactly as a real in-flight prefetch response would.
    await page.request.get("/settings", {
      headers: { cookie: `${before.name}=${before.value}`, "next-router-prefetch": "1", rsc: "1" },
    });

    await page.goto("/inbox");
    await expect(page).toHaveURL(/\/login$/);
    // And the old cookie is now refused everywhere, not just in this browser.
    const reuse = await page.request.get("/api/me", {
      headers: { cookie: `${before.name}=${before.value}` },
    });
    expect(reuse.status()).toBe(401);
  });
});
