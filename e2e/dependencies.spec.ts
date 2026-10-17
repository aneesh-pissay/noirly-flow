import { createTask, expect, openList, taskRow, test, uid } from "./fixtures";

test.describe("dependencies", () => {
  test("a task waiting on another is blocked until that one is done, and loops are refused", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const first = await createTask(page.request, ws, { title: `Design ${id}`, projectId: team.project.id });
    const second = await createTask(page.request, ws, { title: `Build ${id}`, projectId: team.project.id });

    // In the drawer, Build waits on Design.
    const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${second.id}`) && r.request().method() === "GET");
    await page.goto(`${team.url}?task=${second.id}`);
    await loaded;
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${second.id}`) && r.request().method() === "PATCH");
    await page.getByLabel("Find a task this waits on").fill(`Design ${id}`);
    await page.getByRole("list", { name: "Matching tasks" }).getByRole("button", { name: `Design ${id}` }).click();
    await saved;
    await page.keyboard.press("Escape");

    await openList(page, team.url);
    await expect(taskRow(page, `Build ${id}`)).toContainText("Blocked");
    await expect(taskRow(page, `Design ${id}`)).not.toContainText("Blocked");

    // Finishing it first is refused, from the API and from the list.
    const early = await page.request.patch(`/api/tasks/${second.id}`, { data: { status: "done" } });
    expect(early.status()).toBe(409);
    await taskRow(page, `Build ${id}`).getByRole("combobox").first().selectOption("done");
    await expect(page.getByText(/is waiting on other tasks/)).toBeVisible();

    // A loop is refused.
    expect((await page.request.patch(`/api/tasks/${first.id}`, { data: { blockedByIds: [second.id] } })).status()).toBe(400);

    // Done with Design: Build is free.
    expect((await page.request.patch(`/api/tasks/${first.id}`, { data: { status: "done" } })).ok()).toBe(true);
    const free = (await (await page.request.get(`/api/tasks/${second.id}`)).json()).task;
    expect(free.blocked).toBeFalsy();
    expect((await page.request.patch(`/api/tasks/${second.id}`, { data: { status: "done" } })).ok()).toBe(true);
    const { tasks } = await (await page.request.get(`/api/tasks/${first.id}/blocking`)).json();
    expect(tasks.map((t: { id: string }) => t.id)).toEqual([second.id]);
  });
});
