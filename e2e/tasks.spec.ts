import { createTask, expect, openList, taskRow, test, uid } from "./fixtures";

test.describe("tasks in list view", () => {
  test("quick add creates a task that survives a reload", async ({ page, team }) => {
    await openList(page, team.url);

    const title = `Write launch notes ${uid()}`;
    await page.getByPlaceholder("Add a task…").fill(title);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await expect(taskRow(page, title)).toBeVisible();
    await expect(page.getByText(/1 open · 1 shown/)).toBeVisible();
    await expect(page.getByPlaceholder("Add a task…")).toHaveValue("");

    await openList(page, team.url);
    await expect(taskRow(page, title)).toBeVisible();
  });

  test("Add is disabled until there is a title", async ({ page, team }) => {
    await openList(page, team.url);
    const add = page.getByRole("button", { name: "Add", exact: true });
    await expect(add).toBeDisabled();
    await page.getByPlaceholder("Add a task…").fill("   ");
    await expect(add).toBeDisabled();
  });

  test("status, priority and delete from the row", async ({ page, team }) => {
    const title = `Fix login bug ${uid()}`;
    await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await openList(page, team.url);

    const row = taskRow(page, title);
    await expect(page.getByText(/1 open/)).toBeVisible();

    await row.locator("select").nth(1).selectOption("urgent");
    await expect(row.getByText("urgent", { exact: true })).toBeVisible();

    await row.locator("select").first().selectOption("done");
    await expect(row.getByRole("button", { name: title })).toHaveClass(/line-through/);
    await expect(page.getByText(/0 open/)).toBeVisible();

    // Persisted, not just optimistic.
    await openList(page, team.url);
    await expect(taskRow(page, title).locator("select").first()).toHaveValue("done");
    await expect(taskRow(page, title).locator("select").nth(1)).toHaveValue("urgent");

    await taskRow(page, title).getByRole("button", { name: "Delete" }).click();
    await expect(taskRow(page, title)).toHaveCount(0);
    await openList(page, team.url);
    await expect(taskRow(page, title)).toHaveCount(0);
  });

  test("search and filters narrow the list, Clear resets", async ({ page, team }) => {
    const id = uid();
    await createTask(page.request, team.workspace.id, { title: `Alpha report ${id}`, projectId: team.project.id, priority: "high" });
    await createTask(page.request, team.workspace.id, { title: `Beta design ${id}`, projectId: team.project.id, priority: "low" });
    await createTask(page.request, team.workspace.id, { title: `Gamma deploy ${id}`, projectId: team.project.id, status: "done" });
    await openList(page, team.url);
    await expect(page.getByText(/3 shown/)).toBeVisible();

    await page.getByPlaceholder("Search tasks… (/)").fill("Beta");
    await expect(taskRow(page, `Beta design ${id}`)).toBeVisible();
    await expect(taskRow(page, `Alpha report ${id}`)).toHaveCount(0);

    await page.getByRole("button", { name: "Clear" }).click();
    await expect(page.getByText(/3 shown/)).toBeVisible();

    await page.locator("select", { has: page.locator('option[value=""]', { hasText: "Any priority" }) }).selectOption("high");
    await expect(taskRow(page, `Alpha report ${id}`)).toBeVisible();
    await expect(page.getByText(/1 shown/)).toBeVisible();

    await page.getByRole("button", { name: "Clear" }).click();
    await page.locator("select", { has: page.locator('option[value=""]', { hasText: "Any status" }) }).selectOption("done");
    await expect(taskRow(page, `Gamma deploy ${id}`)).toBeVisible();
    await expect(page.getByText(/1 shown/)).toBeVisible();
  });
});
