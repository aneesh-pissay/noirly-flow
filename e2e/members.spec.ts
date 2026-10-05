import { createTask, createTeam, expect, pageAs, test, uid, waitForTasks, type Team } from "./fixtures";
import { USERS } from "./env";
import type { Page } from "@playwright/test";

/** Owner generates an invite link for a role on the Members page. */
async function generateInvite(owner: Page, team: Team, role: "admin" | "member" | "viewer") {
  await owner.goto(`/w/${team.workspace.id}/members`);
  await owner.locator("select", { has: owner.locator('option[value="viewer"]') }).first().selectOption(role);
  await owner.getByRole("button", { name: "Generate link" }).click();
  const url = await owner.locator("input[readonly]").inputValue();
  expect(url).toMatch(/\/invite\/[\w-]+$/);
  return new URL(url).pathname;
}

test.describe("invites and roles", () => {
  test("a member joins through an invite link", async ({ page, team, browser }) => {
    const invitePath = await generateInvite(page, team, "member");

    const member = await pageAs(browser, "member");
    await member.goto(invitePath);
    await expect(member).toHaveURL(new RegExp(`/w/${team.workspace.id}`));
    await expect(member.getByRole("link", { name: new RegExp(`^${team.workspace.name}`) })).toBeVisible();

    await page.reload();
    const row = page.locator("tr", { hasText: USERS.member.email });
    await expect(row).toBeVisible();
    await expect(row.locator("select")).toHaveValue("member");
    await member.context().close();
  });

  test("an invite link works only once", async ({ page, team, browser }) => {
    const invitePath = await generateInvite(page, team, "member");
    const member = await pageAs(browser, "member");
    await member.goto(invitePath);
    await expect(member).toHaveURL(new RegExp(`/w/${team.workspace.id}`));

    // The owner already belongs; a second use must not succeed silently.
    await page.goto(invitePath);
    await expect(page.getByRole("heading", { name: "Invite failed" })).toBeVisible();
    await member.context().close();
  });

  test("a bogus invite token fails gracefully", async ({ page }) => {
    await page.goto(`/invite/not-a-real-token-${uid()}`);
    await expect(page.getByRole("heading", { name: "Invite failed" })).toBeVisible();
  });

  test("viewers can read but not write", async ({ page, team, browser }) => {
    const title = `Read only ${uid()}`;
    await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    const invitePath = await generateInvite(page, team, "viewer");

    const viewer = await pageAs(browser, "member");
    await viewer.goto(invitePath);
    await expect(viewer).toHaveURL(new RegExp(`/w/${team.workspace.id}`));
    await viewer.goto(team.url);
    await waitForTasks(viewer);
    await expect(viewer.getByText("You have view-only access")).toBeVisible();
    await expect(viewer.getByPlaceholder("Add a task…")).toHaveCount(0);
    await expect(viewer.getByText(title)).toBeVisible();

    // The API enforces it too, not just the UI.
    const write = await viewer.request.post(`/api/workspaces/${team.workspace.id}/tasks`, {
      data: { title: "sneaky", projectId: team.project.id },
    });
    expect(write.status()).toBe(403);
    await viewer.context().close();
  });

  test("removing a member revokes access", async ({ page, team, browser }) => {
    const invitePath = await generateInvite(page, team, "member");
    const member = await pageAs(browser, "member");
    await member.goto(invitePath);
    await expect(member).toHaveURL(new RegExp(`/w/${team.workspace.id}`));

    await page.reload();
    await page.locator("tr", { hasText: USERS.member.email }).getByRole("button", { name: "Remove" }).click();
    await expect(page.locator("tr", { hasText: USERS.member.email })).toHaveCount(0);

    const read = await member.request.get(`/api/workspaces/${team.workspace.id}`);
    expect([403, 404]).toContain(read.status());
    await member.context().close();
  });

  test("outsiders cannot read another team's workspace", async ({ browser }) => {
    const owner = await pageAs(browser, "owner");
    const team = await createTeam(owner.request, `Private ${uid()}`);
    const outsider = await pageAs(browser, "member");
    const read = await outsider.request.get(`/api/workspaces/${team.workspace.id}`);
    expect([403, 404]).toContain(read.status());
    const tasks = await outsider.request.get(`/api/workspaces/${team.workspace.id}/tasks`);
    expect([403, 404]).toContain(tasks.status());
    await owner.context().close();
    await outsider.context().close();
  });
});
