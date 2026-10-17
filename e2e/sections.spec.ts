import { createTask, expect, openList, test, uid } from "./fixtures";

test.describe("sections", () => {
  test("group the list, move tasks between them, and leave tasks behind when deleted", async ({ page, team }) => {
    const id = uid();
    const task = await createTask(page.request, team.workspace.id, { title: `Draft spec ${id}`, projectId: team.project.id });
    await createTask(page.request, team.workspace.id, { title: `Loose ${id}`, projectId: team.project.id });

    await openList(page, team.url);
    await page.getByRole("button", { name: "+ Add section" }).click();
    await page.getByLabel("New section name").fill(`Planning ${id}`);
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    const planning = page.getByRole("group", { name: `Section Planning ${id}` });
    await expect(planning).toContainText("No tasks in this section.");

    // Move a task into the section from the drawer.
    const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "GET");
    await page.getByRole("button", { name: `Draft spec ${id}` }).click();
    await loaded;
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "PATCH");
    await page.getByLabel("Section", { exact: true }).selectOption({ label: `Planning ${id}` });
    await saved;
    await page.keyboard.press("Escape");
    await expect(planning).toContainText(`Draft spec ${id}`);
    await expect(page.getByRole("group", { name: "No section" })).toContainText(`Loose ${id}`);

    // Rename, then delete: the task stays, back under No section.
    await page.getByRole("button", { name: `Rename section Planning ${id}` }).click();
    await page.getByLabel("Section name").fill(`Ready ${id}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("group", { name: `Section Ready ${id}` })).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: `Delete section Ready ${id}` }).click();
    await expect(page.getByRole("group", { name: `Section Ready ${id}` })).toHaveCount(0);
    await expect(page.getByText(`Draft spec ${id}`)).toBeVisible();
    expect((await (await page.request.get(`/api/tasks/${task.id}`)).json()).task.sectionId).toBeNull();
  });

  test("moving a task to another project clears its section", async ({ page, team }) => {
    const id = uid();
    const { section } = await (await page.request.post(`/api/projects/${team.project.id}/sections`, { data: { name: `S ${id}` } })).json();
    const task = await createTask(page.request, team.workspace.id, { title: `Mover ${id}`, projectId: team.project.id });
    expect((await page.request.patch(`/api/tasks/${task.id}`, { data: { sectionId: section.id } })).ok()).toBe(true);
    const moved = await (await page.request.patch(`/api/tasks/${task.id}`, { data: { projectId: null } })).json();
    expect(moved.task.sectionId).toBeNull();
    // A section from another project is refused.
    const { project: other } = await (await page.request.post(`/api/workspaces/${team.workspace.id}/projects`, { data: { name: `Other ${id}` } })).json();
    const bad = await page.request.patch(`/api/tasks/${task.id}`, { data: { projectId: other.id, sectionId: section.id } });
    expect(bad.status()).toBe(403);
  });
});
