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
    await expect(page.getByRole("button", { name: `Errands ${id}` })).toBeVisible();

    // A block opens the task.
    await block.click();
    await expect(page).toHaveURL(new RegExp(`[?&]task=${meeting.id}`));
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page.getByRole("button", { name: new RegExp(`Standup ${id}`) })).toHaveCount(0);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("button", { name: new RegExp(`Standup ${id}`) })).toBeVisible();
  });
});
