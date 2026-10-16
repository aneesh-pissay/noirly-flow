import { createTask, expect, openList, taskRow, test, uid } from "./fixtures";

test.describe("tasks in list view", () => {
  test("creating a task from the dialog survives a reload", async ({ page, team }) => {
    await openList(page, team.url);

    const title = `Write launch notes ${uid()}`;
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create task" });
    await dialog.getByRole("textbox", { name: "Title" }).fill(title);
    await dialog.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(dialog).toBeHidden();

    await openList(page, team.url);
    await expect(taskRow(page, title)).toBeVisible();
    await expect(page.getByText(/1 open · 1 shown/)).toBeVisible();
  });

  test("quick add reads dates, repeats, priority and project from the title", async ({ page, team }) => {
    const id = uid();
    await openList(page, team.url);
    const tasks = async () => (await (await page.request.get(`/api/workspaces/${team.workspace.id}/tasks`)).json()).tasks as Array<Record<string, unknown>>;

    await page.getByRole("button", { name: "New task", exact: true }).click();
    let dialog = page.getByRole("dialog", { name: "Create task" });
    await expect(dialog.getByText("Not created yet")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Title" }).fill(`Pay rent ${id} every 1st 9am p1 #${team.project.name}`);
    const preview = dialog.locator("#quick-add-preview");
    await expect(preview).toContainText("P1");
    await expect(preview).toContainText(`#${team.project.name}`);
    await expect(preview).toContainText("Every month on day 1");
    await expect(preview).toContainText(`saves as “Pay rent ${id}”`);
    await dialog.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(dialog).toBeHidden();

    const rent = (await tasks()).find((t) => t.title === `Pay rent ${id}`)!;
    expect(rent).toMatchObject({ priority: "high", dueHasTime: true, projectId: team.project.id, recurrence: { frequency: "monthly", monthDay: 1 } });
    expect(new Date(rent.dueAt as string).getDate()).toBe(1);
    expect(new Date(rent.dueAt as string).getHours()).toBe(9);

    // "Keep as typed" saves the words as they are. Creating opened the new task's drawer; close it first.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Close task" })).toBeHidden();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "Create task" });
    await expect(dialog.getByText("Not created yet")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Title" }).fill(`Read Monday notes tomorrow ${id}`);
    await dialog.getByRole("button", { name: "Keep as typed" }).click();
    await expect(dialog.locator("#quick-add-preview")).toContainText("Quick add is off.");
    await dialog.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await tasks()).find((t) => t.title === `Read Monday notes tomorrow ${id}`)).toMatchObject({ dueAt: null });
  });

  test("Create task is disabled until there is a title", async ({ page, team }) => {
    await openList(page, team.url);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create task" });
    const create = dialog.getByRole("button", { name: "Create task", exact: true });
    // Disabled while the workspace loads too, so wait for the form to be ready.
    await expect(dialog.getByText("Not created yet")).toBeVisible();
    await expect(create).toBeDisabled();
    await dialog.getByRole("textbox", { name: "Title" }).fill("   ");
    await expect(create).toBeDisabled();
    await dialog.getByRole("textbox", { name: "Title" }).fill("Real title");
    await expect(create).toBeEnabled();
  });

  test("status, priority and delete from the row", async ({ page, team }) => {
    const title = `Fix login bug ${uid()}`;
    await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await openList(page, team.url);

    const row = taskRow(page, title);
    await expect(page.getByText(/1 open/)).toBeVisible();

    await row.locator("select").nth(1).selectOption("high");
    await expect(row.getByText("high", { exact: true })).toBeVisible();

    await row.locator("select").first().selectOption("done");
    await expect(row.getByRole("button", { name: title })).toHaveClass(/line-through/);
    await expect(page.getByText(/0 open/)).toBeVisible();

    // Persisted, not just optimistic.
    await openList(page, team.url);
    await expect(taskRow(page, title).locator("select").first()).toHaveValue("done");
    await expect(taskRow(page, title).locator("select").nth(1)).toHaveValue("high");

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
