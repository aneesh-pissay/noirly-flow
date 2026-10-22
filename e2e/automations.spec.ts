import { createTask, expect, openList, test, uid } from "./fixtures";

test.describe("automations", () => {
  test("a rule built in the dialog changes matching tasks, and only those", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const { tag } = await (await page.request.post(`/api/workspaces/${ws}/tags`, { data: { name: `escalated-${id}` } })).json();

    await openList(page, team.url);
    await page.getByRole("button", { name: "Automations" }).click();
    const dialog = page.getByRole("dialog", { name: "Automations" });
    await expect(dialog.getByText("No automations yet.")).toBeVisible();
    await dialog.getByLabel("Name").fill(`Escalate ${id}`);
    await dialog.getByLabel("Trigger").selectOption({ label: "Status changes" });
    await dialog.getByLabel("Changes to").selectOption({ label: "to In progress" });
    await dialog.getByRole("button", { name: "+ Add condition" }).click();
    await dialog.getByLabel("condition 1", { exact: true }).selectOption({ label: "Title contains" });
    await dialog.getByLabel("condition 1 value").fill("bug");
    await dialog.getByLabel("action 1", { exact: true }).selectOption({ label: "Set priority" });
    await dialog.getByLabel("action 1 value").selectOption({ label: "Urgent" });
    await dialog.getByRole("button", { name: "+ Add action" }).click();
    await dialog.getByLabel("action 2", { exact: true }).selectOption({ label: "Add tag" });
    await dialog.getByLabel("action 2 value").selectOption({ label: `#escalated-${id}` });
    const sentence = `When a task moves to In progress, if the title contains “bug”, then set priority to Urgent and add tag #escalated-${id}.`;
    await expect(dialog.getByText(sentence)).toBeVisible();
    await page.screenshot({ path: "test-results/automations-builder.png" });
    await dialog.getByRole("button", { name: "Add automation" }).click();
    const rule = dialog.locator(`[data-rule="Escalate ${id}"]`);
    await expect(rule).toContainText(sentence);
    await expect(rule).toContainText("Hasn't run yet");

    // Matching task changes; the other doesn't.
    const bug = await createTask(page.request, ws, { title: `Login bug ${id}`, projectId: team.project.id });
    const copy = await createTask(page.request, ws, { title: `Copy tweak ${id}`, projectId: team.project.id });
    const start = async (taskId: string) =>
      (await (await page.request.patch(`/api/tasks/${taskId}`, { data: { status: "in_progress" } })).json()).task;
    const changed = await start(bug.id);
    expect(changed).toMatchObject({ status: "in_progress", priority: "urgent", tagIds: [tag.id] });
    expect(await start(copy.id)).toMatchObject({ priority: "none", tagIds: [] });

    await page.reload();
    await page.getByRole("button", { name: "Automations" }).click();
    await expect(rule).toContainText("Ran 1 time");
    await page.screenshot({ path: "test-results/automations-list.png" });

    const activity = await (await page.request.get(`/api/workspaces/${ws}/activity?taskId=${bug.id}`)).json();
    expect(JSON.stringify(activity)).toContain("automation.ran");

    // Turning it off stops it.
    // The switch moves at once; wait for the save before testing the rule.
    const off = page.waitForResponse((r) => /\/api\/automations\/[a-f0-9]{24}$/.test(r.url()) && r.request().method() === "PATCH");
    await dialog.getByLabel(`Escalate ${id} enabled`).uncheck();
    await expect(rule).toHaveClass(/opacity-60/);
    expect((await off).ok()).toBe(true);
    const another = await createTask(page.request, ws, { title: `Another bug ${id}`, projectId: team.project.id });
    expect(await start(another.id)).toMatchObject({ priority: "none" });
  });

  test("dates count in the rule's zone, rules don't set each other off, and references are checked", async ({ page, team }) => {
    const id = uid();
    const project = team.project.id;
    const add = (data: object) => page.request.post(`/api/projects/${project}/automations`, { data });

    expect((await add({ name: "Due soon", trigger: { type: "created" }, actions: [{ type: "set_due_in_days", value: 2 }], timeZone: "Asia/Kolkata" })).status()).toBe(201);
    const created = await createTask(page.request, team.workspace.id, { title: `Fresh ${id}`, projectId: project });
    const fresh = (await (await page.request.get(`/api/tasks/${created.id}`)).json()).task;
    expect(fresh.dueHasTime).toBe(false);
    expect(new Date(fresh.dueAt).toISOString()).toMatch(/T06:30:00\.000Z$/); // noon in Kolkata

    // A sets priority on start; B would reset status on that priority, but rule changes don't trigger rules.
    expect((await add({ name: "A", trigger: { type: "status_changed", to: "in_progress" }, actions: [{ type: "set_priority", value: "urgent" }] })).status()).toBe(201);
    expect((await add({ name: "B", trigger: { type: "priority_changed", to: "urgent" }, actions: [{ type: "set_status", value: "todo" }] })).status()).toBe(201);
    const task = await createTask(page.request, team.workspace.id, { title: `Loop ${id}`, projectId: project });
    const after = (await (await page.request.patch(`/api/tasks/${task.id}`, { data: { status: "in_progress" } })).json()).task;
    expect(after).toMatchObject({ status: "in_progress", priority: "urgent" });

    expect((await add({ name: "Bad", trigger: { type: "created" }, actions: [{ type: "add_tag", value: "000000000000000000000000" }] })).status()).toBe(400);
    expect((await add({ name: "Empty", trigger: { type: "created" }, actions: [] })).status()).toBe(400);
  });
});
