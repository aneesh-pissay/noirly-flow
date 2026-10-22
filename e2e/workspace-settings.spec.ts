import type { Page } from "@playwright/test";
import { createTask, expect, pageAs, test, uid, waitForTasks, type Team } from "./fixtures";

async function join(owner: Page, member: Page, team: Team) {
  const created = await owner.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role: "member" } });
  const { invite } = (await created.json()) as { invite: { token: string } };
  expect((await member.request.post("/api/invites/accept", { data: { token: invite.token } })).ok()).toBe(true);
}

test.describe("workspace customisation", () => {
  test("icon, default view and status names apply across the workspace", async ({ page, team, browser }) => {
    const id = uid();
    const ws = team.workspace.id;
    await page.goto(`/w/${ws}/settings`);
    await expect(page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Statuses" })).toBeVisible();

    // Icon and colour show in the sidebar.
    await page.getByRole("radio", { name: "Icon 🚀" }).click();
    await expect(page.getByRole("radio", { name: "Icon 🚀" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Green" }).click();
    await expect(page.getByRole("radio", { name: "Green" })).toHaveAttribute("aria-checked", "true");
    // The icon is decorative (aria-hidden), so look at the link's text, not its name.
    await expect(page.locator("a", { hasText: team.workspace.name }).first()).toContainText("🚀");

    // New projects open in the workspace's default view.
    await page.getByLabel("Default view for new projects").selectOption({ label: "List" });
    await expect(page.getByText("Saved").first()).toBeVisible();

    // Status names: must differ, then save.
    await page.getByLabel("Name for Todo").fill("Backlog");
    await page.getByLabel("Name for In progress").fill("backlog");
    await expect(page.getByText("Each status needs a different name")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save names" })).toBeDisabled();
    await page.getByLabel("Name for In progress").fill("");
    await page.getByLabel("Name for Done").fill(`Shipped ${id}`);
    await page.getByRole("button", { name: "Save names" }).click();
    await expect(page.getByLabel("Name for Done")).toHaveValue(`Shipped ${id}`);
    await page.screenshot({ path: "test-results/workspace-settings.png", fullPage: true });

    const { project } = await (await page.request.post(`/api/workspaces/${ws}/projects`, { data: { name: `Fresh ${id}` } })).json();
    expect(project.defaultView).toBe("list");
    await createTask(page.request, ws, { title: `Named ${id}`, projectId: project.id });
    await page.goto(`/w/${ws}/p/${project.id}`);
    await waitForTasks(page);
    await expect(page.getByRole("button", { name: "+ Add section" })).toBeVisible(); // list view
    // The workspace's names are used for statuses.
    await expect(page.getByRole("combobox").filter({ has: page.getByRole("option", { name: "Backlog" }) }).first()).toBeVisible();
    await page.getByRole("button", { name: `Named ${id}` }).click();
    await expect(page.getByRole("option", { name: `Shipped ${id}` }).first()).toBeAttached();
    await page.keyboard.press("Escape");

    // A project can keep its own default.
    await page.getByRole("button", { name: "Board", exact: true }).click();
    await page.getByRole("button", { name: "Make default" }).click();
    await expect(page.getByRole("button", { name: "Make default" })).toHaveCount(0);
    await page.reload();
    await waitForTasks(page);
    await expect(page.getByRole("button", { name: "+ Add section" })).toHaveCount(0); // board view
    // Its first columns were named after the workspace's statuses (the filter's options are hidden).
    await expect(page.locator(":text-is('Backlog'):visible")).toHaveCount(1);
    await expect(page.locator(`:text-is('Shipped ${id}'):visible`)).toHaveCount(1);
    await page.screenshot({ path: "test-results/workspace-board.png" });

    // Only admins customise, and the icon must be one emoji.
    expect((await page.request.patch(`/api/workspaces/${ws}/customization`, { data: { icon: "AB" } })).status()).toBe(400);
    const member = await pageAs(browser, "member");
    await join(page, member, team);
    expect((await member.request.patch(`/api/workspaces/${ws}/customization`, { data: { icon: "🔥" } })).status()).toBe(403);
    await member.context().close();
  });
});
