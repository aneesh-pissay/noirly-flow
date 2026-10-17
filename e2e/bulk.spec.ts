import { createTask, expect, openList, taskRow, test, uid } from "./fixtures";

test.describe("bulk edit", () => {
  test("select tasks, then change, move and delete them together", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const a = await createTask(page.request, ws, { title: `Alpha ${id}`, projectId: team.project.id });
    const b = await createTask(page.request, ws, { title: `Beta ${id}`, projectId: team.project.id });
    const c = await createTask(page.request, ws, { title: `Gamma ${id}`, projectId: team.project.id });
    const get = async (taskId: string) => (await (await page.request.get(`/api/tasks/${taskId}`)).json()).task;

    await openList(page, team.url);
    await page.getByRole("button", { name: "Select", exact: true }).click();
    const bar = page.getByRole("region", { name: "Bulk edit" });
    await expect(bar).toContainText("0 selected");

    await page.getByRole("checkbox", { name: `Select Alpha ${id}` }).check();
    // A row click selects too while selecting.
    await taskRow(page, `Beta ${id}`).click({ position: { x: 4, y: 4 } });
    await expect(bar).toContainText("2 selected");

    await bar.getByLabel("Set priority").selectOption("high");
    await expect(bar).toContainText("2 tasks updated.");
    expect((await get(a.id)).priority).toBe("high");
    expect((await get(b.id)).priority).toBe("high");
    expect((await get(c.id)).priority).toBe("none");

    await bar.getByRole("button", { name: /^Select all/ }).click();
    await bar.getByLabel("Set status").selectOption("in_progress");
    await expect.poll(async () => (await get(c.id)).status).toBe("in_progress");

    await page.getByRole("checkbox", { name: `Select Gamma ${id}` }).check();
    await bar.getByLabel("Move to project").selectOption("inbox");
    await expect.poll(async () => (await get(c.id)).projectId).toBeNull();
    await expect(page.getByText(`Gamma ${id}`)).toHaveCount(0);

    await page.getByRole("checkbox", { name: `Select Alpha ${id}` }).check();
    page.once("dialog", (dialog) => void dialog.accept());
    await bar.getByRole("button", { name: "Delete" }).click();
    await expect(bar).toContainText("1 task deleted.");
    expect((await page.request.get(`/api/tasks/${a.id}`)).status()).toBe(404);

    await bar.getByRole("button", { name: "Done" }).click();
    await expect(bar).toHaveCount(0);
  });

  test("the API refuses tasks from another workspace, task by task", async ({ page, team }) => {
    const mine = await createTask(page.request, team.workspace.id, { title: `Mine ${uid()}`, projectId: team.project.id });
    const { workspace } = await (await page.request.post("/api/workspaces", { data: { name: `Other ${uid()}` } })).json();
    const response = await page.request.post(`/api/workspaces/${workspace.id}/tasks/bulk`, {
      data: { taskIds: [mine.id], patch: { priority: "low" } },
    });
    const body = await response.json();
    expect(body.tasks).toEqual([]);
    expect(body.failed).toEqual([expect.objectContaining({ id: mine.id })]);
    expect((await (await page.request.get(`/api/tasks/${mine.id}`)).json()).task.priority).toBe("none");
  });
});
