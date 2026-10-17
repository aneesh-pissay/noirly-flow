import { createTask, expect, openList, test, uid } from "./fixtures";

test.describe("templates", () => {
  test("a task saved as a template comes back with its subtasks", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const source = await createTask(page.request, ws, { title: `Onboard ${id}`, projectId: team.project.id, priority: "high" });
    await createTask(page.request, ws, { title: `Laptop ${id}`, projectId: team.project.id, parentTaskId: source.id });
    await createTask(page.request, ws, { title: `Accounts ${id}`, projectId: team.project.id, parentTaskId: source.id });

    // Save from the drawer.
    await page.goto(`${team.url}?task=${source.id}`);
    page.once("dialog", (dialog) => void dialog.accept(`Onboarding ${id}`));
    await page.getByRole("button", { name: "Save as template" }).click();
    await expect(page.getByText(`Saved “Onboarding ${id}”`)).toBeVisible();
    await page.keyboard.press("Escape");

    // Create from it in the dialog, renaming the top task.
    await openList(page, team.url);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create task" });
    await expect(dialog.getByText("Not created yet")).toBeVisible();
    await dialog.getByLabel(/From template/).selectOption({ label: `Onboarding ${id}` });
    await expect(dialog.getByRole("textbox", { name: "Title" })).toHaveValue(`Onboard ${id}`);
    await expect(dialog.getByText("Also adds 2 subtasks.")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Title" }).fill(`Onboard Sam ${id}`);
    await dialog.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(dialog).toBeHidden();

    const { tasks } = await (await page.request.get(`/api/workspaces/${ws}/tasks`)).json();
    const copy = (tasks as Array<{ id: string; title: string; priority: string; subtaskCount?: { total: number } }>)
      .find((t) => t.title === `Onboard Sam ${id}`)!;
    expect(copy.priority).toBe("high");
    expect(copy.subtaskCount?.total).toBe(2);
  });

  test("a project saved as a template makes a new project with its sections and tasks", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const { section } = await (await page.request.post(`/api/projects/${team.project.id}/sections`, { data: { name: `Week 1 ${id}` } })).json();
    const step = await createTask(page.request, ws, { title: `Kickoff ${id}`, projectId: team.project.id });
    expect((await page.request.patch(`/api/tasks/${step.id}`, { data: { sectionId: section.id } })).ok()).toBe(true);

    const saved = await page.request.post(`/api/workspaces/${ws}/templates`, { data: { kind: "project", projectId: team.project.id, name: `Sprint ${id}` } });
    expect(saved.status()).toBe(201);

    await page.goto(team.url);
    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await page.getByPlaceholder("Project name").fill(`Sprint 2 ${id}`);
    await page.getByLabel("Project template").selectOption({ label: `From “Sprint ${id}”` });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page).toHaveURL(/\/p\/[a-f0-9]{24}$/);

    const projectId = page.url().split("/").at(-1)!;
    const { sections } = await (await page.request.get(`/api/projects/${projectId}/sections`)).json();
    expect(sections.map((s: { name: string }) => s.name)).toEqual([`Week 1 ${id}`]);
    const { tasks } = await (await page.request.get(`/api/workspaces/${ws}/tasks?projectId=${projectId}`)).json();
    expect(tasks).toEqual([expect.objectContaining({ title: `Kickoff ${id}`, sectionId: sections[0].id })]);
  });
});
