import { createTask, expect, test, uid } from "./fixtures";

function todayAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test.describe("timeline", () => {
  test("drag to move, stretch to resize, and drag a task in to schedule it", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const block = await createTask(page.request, ws, { title: `Focus ${id}`, projectId: team.project.id });
    expect((await page.request.patch(`/api/tasks/${block.id}`, { data: { dueAt: todayAt(9), dueHasTime: true, durationMinutes: 60 } })).ok()).toBe(true);
    const loose = await createTask(page.request, ws, { title: `Loose ${id}`, projectId: team.project.id });
    const get = async (taskId: string) => (await (await page.request.get(`/api/tasks/${taskId}`)).json()).task;
    const hourPx = 48;

    await page.goto(`/w/${ws}/timeline`);
    await page.getByRole("button", { name: "Day", exact: true }).click();
    const column = page.locator("[data-timeline-day]");
    const focus = page.getByRole("button", { name: new RegExp(`Focus ${id}`) });
    await expect(focus).toBeVisible();

    // Move: two hours later.
    let box = (await focus.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 10 + hourPx, { steps: 5 });
    await page.mouse.move(box.x + box.width / 2, box.y + 10 + 2 * hourPx, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => new Date((await get(block.id)).dueAt).getHours()).toBe(11);
    await expect(page).not.toHaveURL(/[?&]task=/);

    // Resize: pull the bottom edge down an hour.
    box = (await focus.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 2 + hourPx, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await get(block.id)).durationMinutes).toBe(120);

    // Schedule: drag a task from the side panel to 14:00.
    const item = page.getByRole("complementary", { name: "To schedule" }).getByRole("button", { name: new RegExp(`Loose ${id}`) });
    const itemBox = (await item.boundingBox())!;
    const colBox = (await column.boundingBox())!;
    await page.mouse.move(itemBox.x + 10, itemBox.y + 10);
    await page.mouse.down();
    await page.mouse.move(colBox.x + colBox.width / 2, colBox.y + 14.25 * hourPx, { steps: 10 });
    await page.mouse.up();
    await expect.poll(async () => {
      const task = await get(loose.id);
      return task.dueHasTime ? new Date(task.dueAt).getHours() * 60 + new Date(task.dueAt).getMinutes() : null;
    }).toBe(14 * 60);
  });

  test("shows timed tasks on the hours and all-day ones on top, by day or week", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const meeting = await createTask(page.request, ws, { title: `Standup ${id}`, projectId: team.project.id });
    expect((await page.request.patch(`/api/tasks/${meeting.id}`, { data: { dueAt: todayAt(10), dueHasTime: true, durationMinutes: 60 } })).ok()).toBe(true);
    await createTask(page.request, ws, { title: `Errands ${id}`, projectId: null, dueAt: today() });

    await page.goto(`/w/${ws}/timeline`);
    await expect(page.getByRole("heading", { level: 1, name: "Timeline" })).toBeVisible();
    // Week by default: seven day columns.
    await expect(page.getByRole("group", { name: /\d{4}/ })).toHaveCount(7);

    await page.getByRole("button", { name: "Day", exact: true }).click();
    await expect(page.getByRole("group", { name: /\d{4}/ })).toHaveCount(1);
    const block = page.getByRole("button", { name: new RegExp(`Standup ${id}`) });
    await expect(block).toBeVisible();
    await expect(block).toContainText("1h");
    // In the day's all-day strip (it's also offered in "To schedule").
    await expect(page.getByRole("group", { name: /\d{4}/ }).getByRole("button", { name: `Errands ${id}` })).toBeVisible();

    // A block opens the task.
    await block.click();
    await expect(page).toHaveURL(new RegExp(`[?&]task=${meeting.id}`));
    // …and the drawer really shows it, not just the URL.
    await expect(page.locator("aside").getByRole("textbox", { name: "Task title" })).toHaveValue(`Standup ${id}`);
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page.getByRole("button", { name: new RegExp(`Standup ${id}`) })).toHaveCount(0);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("button", { name: new RegExp(`Standup ${id}`) })).toBeVisible();
  });
});
