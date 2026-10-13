import { createTask, createTeam, expect, pageAs, test, uid, waitForTasks, type Team } from "./fixtures";
import type { Page } from "@playwright/test";

/** Adds the "member" user to the owner's team with the given role, via the API. */
async function joinAs(owner: Page, member: Page, team: Team, role: "admin" | "member") {
  const created = await owner.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role } });
  expect(created.ok()).toBe(true);
  const { invite } = (await created.json()) as { invite: { token: string } };
  const accepted = await member.request.post("/api/invites/accept", { data: { token: invite.token } });
  expect(accepted.ok()).toBe(true);
}

test.describe("projects", () => {
  test("rename a project from the sidebar", async ({ page, team }) => {
    await page.goto(team.url);
    await waitForTasks(page);
    const name = `Renamed ${uid()}`;

    await page.getByRole("button", { name: `Edit ${team.project.name}` }).click();
    await page.getByLabel("Project name").fill(name);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  });

  test("delete a project and its tasks", async ({ page, team }) => {
    const res = await page.request.post(`/api/workspaces/${team.workspace.id}/projects`, {
      data: { name: `Doomed ${uid()}` },
    });
    const { project } = (await res.json()) as { project: { id: string; name: string } };
    const title = `Doomed task ${uid()}`;
    await createTask(page.request, team.workspace.id, { title, projectId: project.id });

    await page.goto(`/w/${team.workspace.id}/p/${project.id}`);
    await waitForTasks(page);
    await expect(page.getByText(title)).toBeVisible();

    await page.getByRole("button", { name: `Edit ${project.name}` }).click();
    const editForm = page.locator("form", { has: page.getByLabel("Project name") });
    await editForm.getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByRole("button", { name: "Delete project" }).click();

    await expect(page.getByRole("link", { name: project.name, exact: true })).toHaveCount(0);
    // Leaves the deleted project for the workspace's first one.
    await expect(page).toHaveURL(new RegExp(`/w/${team.workspace.id}/p/${team.project.id}`));
    expect((await page.request.get(`/api/projects/${project.id}`)).status()).toBe(404);
    const tasks = await page.request.get(`/api/workspaces/${team.workspace.id}/tasks`);
    expect(JSON.stringify(await tasks.json())).not.toContain(title);
  });

  test("members can rename but not delete projects", async ({ page, team, browser }) => {
    const member = await pageAs(browser, "member");
    await joinAs(page, member, team, "member");

    const renamed = await member.request.patch(`/api/projects/${team.project.id}`, { data: { name: `By member ${uid()}` } });
    expect(renamed.status()).toBe(200);
    const deleted = await member.request.delete(`/api/projects/${team.project.id}`);
    expect(deleted.status()).toBe(403);
    await member.context().close();
  });
});

test.describe("workspaces", () => {
  test("rename a team workspace", async ({ page, team }) => {
    await page.goto(`/w/${team.workspace.id}/settings`);
    const name = `Guild ${uid()}`;
    await page.getByLabel("Workspace name").fill(name);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Workspace name")).toHaveValue(name);
  });

  test("delete a team workspace after typing its name", async ({ page }) => {
    const team = await createTeam(page.request, `Short lived ${uid()}`);
    await page.goto(`/w/${team.workspace.id}/settings`);

    const remove = page.getByRole("button", { name: "Delete workspace" });
    await expect(remove).toBeDisabled();
    await page.getByLabel(/to confirm/).fill(team.workspace.name);
    await remove.click();

    await expect(page).not.toHaveURL(new RegExp(team.workspace.id));
    await expect(page.getByRole("link", { name: new RegExp(`^${team.workspace.name}`) })).toHaveCount(0);
    expect((await page.request.get(`/api/workspaces/${team.workspace.id}`)).status()).toBe(403);
  });

  test("only the owner can delete; admins can rename", async ({ page, team, browser }) => {
    const admin = await pageAs(browser, "member");
    await joinAs(page, admin, team, "admin");

    const renamed = await admin.request.patch(`/api/workspaces/${team.workspace.id}`, { data: { name: `By admin ${uid()}` } });
    expect(renamed.status()).toBe(200);
    const deleted = await admin.request.delete(`/api/workspaces/${team.workspace.id}`);
    expect(deleted.status()).toBe(403);
    await admin.context().close();
  });

  test("the personal workspace can't be renamed or deleted", async ({ page }) => {
    const { workspaces } = (await (await page.request.get("/api/workspaces")).json()) as {
      workspaces: Array<{ id: string; kind: string }>;
    };
    const personal = workspaces.find((w) => w.kind === "personal")!;
    expect((await page.request.patch(`/api/workspaces/${personal.id}`, { data: { name: "Nope" } })).status()).toBe(400);
    expect((await page.request.delete(`/api/workspaces/${personal.id}`)).status()).toBe(400);

    await page.goto(`/w/${personal.id}/settings`);
    await expect(page.getByLabel("Workspace name")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Delete workspace" })).toHaveCount(0);
  });
});
