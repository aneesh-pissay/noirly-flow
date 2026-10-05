import { createTask, expect, test, uid, waitForTasks } from "./fixtures";

test("create a team workspace from the sidebar", async ({ page }) => {
  await page.goto("/inbox");
  const name = `Design Guild ${uid()}`;
  await page.getByRole("button", { name: /new team workspace/i }).click();
  await page.getByPlaceholder("Team name").fill(name);
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const link = page.getByRole("link", { name: new RegExp(`^${name}`) });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/w\/[a-f0-9]{24}\/p\/[a-f0-9]{24}/);
  // New teams are seeded with a General project.
  await expect(page.getByText("General").first()).toBeVisible();
});

test("create a project and land on it", async ({ page, team }) => {
  await page.goto(team.url);
  await waitForTasks(page);
  const name = `Roadmap ${uid()}`;
  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByPlaceholder("Project name").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).first().click();

  await expect(page.getByRole("link", { name })).toBeVisible();
  await page.getByRole("link", { name }).click();
  await expect(page.getByText(name).first()).toBeVisible();
});

test("workspace inbox holds tasks that are not in a project", async ({ page, team }) => {
  await page.goto(`/w/${team.workspace.id}/inbox`);
  await waitForTasks(page);
  await expect(page.getByText("Inbox is empty. Add a task that is not in a project.")).toBeVisible();

  const title = `Loose end ${uid()}`;
  await createTask(page.request, team.workspace.id, { title, projectId: null });
  await page.reload();
  await waitForTasks(page);
  await expect(page.getByRole("button", { name: title })).toBeVisible();
});

test("workspace root jumps to its first project", async ({ page, team }) => {
  await page.goto(`/w/${team.workspace.id}`);
  await expect(page).toHaveURL(new RegExp(`/w/${team.workspace.id}/p/${team.project.id}`));
});
