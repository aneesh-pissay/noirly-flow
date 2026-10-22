import type { Page } from "@playwright/test";
import { createTask, expect, openList, taskRow, test, uid } from "./fixtures";

const userCaches = (page: Page) => page.evaluate(async () => (await caches.keys()).filter((key) => /^flow-(pages|data)-/.test(key)));

test.describe("installable app and read-only offline", () => {
  test("installs from a manifest", async ({ page }) => {
    const response = await page.request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest).toMatchObject({ name: "Noirly Flow", short_name: "Flow", start_url: "/inbox", display: "standalone" });
    expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toEqual(["any", "any", "maskable"]);
    for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Install Flow" })).toBeVisible();
  });

  test("pages opened before stay readable offline, writes are refused, and sign-out clears them", async ({ page, team, context }) => {
    const id = uid();
    await createTask(page.request, team.workspace.id, { title: `Readable ${id}`, projectId: team.project.id });

    // First visit installs the worker; the second is served through it and saved.
    await openList(page, team.url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await openList(page, team.url);
    await expect(taskRow(page, `Readable ${id}`)).toBeVisible();
    await expect.poll(async () => (await userCaches(page)).length).toBe(2);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(/You're offline\. Showing what was last loaded/)).toBeVisible();
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(taskRow(page, `Readable ${id}`)).toBeVisible();
    await page.screenshot({ path: "test-results/offline-list.png" });

    // Writes fail at once and say why.
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create task" });
    await dialog.getByRole("textbox", { name: "Title" }).fill(`Offline ${id}`);
    await dialog.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(dialog.getByText("You're offline. Changes can't be saved until you reconnect.")).toBeVisible();
    await page.keyboard.press("Escape");

    // A page never opened here gets the offline page.
    await page.goto(`/w/${team.workspace.id}/goals`);
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible();

    await context.setOffline(false);
    await openList(page, team.url);
    await expect(page.getByText(/You're offline\. Showing what was last loaded/)).toHaveCount(0);

    // Signing out deletes this person's saved copies. (The request itself is
    // blocked so the shared test session stays signed in.)
    await page.route("**/*", (route) => (route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort() : route.continue()));
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect.poll(async () => (await userCaches(page)).length).toBe(0);
  });
});
