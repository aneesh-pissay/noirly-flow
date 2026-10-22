import { createTask, expect, test, uid } from "./fixtures";

function day(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test.describe("habits", () => {
  test("a repeating task marked as a habit keeps a streak when done on time, and loses it when late", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const daily = { frequency: "daily", interval: 1 };
    const walk = await createTask(page.request, ws, { title: `Walk ${id}`, projectId: team.project.id, dueAt: day(0) });
    expect((await page.request.patch(`/api/tasks/${walk.id}`, { data: { recurrence: daily } })).ok()).toBe(true);
    const read = await createTask(page.request, ws, { title: `Read ${id}`, projectId: team.project.id, dueAt: day(-1) });
    expect((await page.request.patch(`/api/tasks/${read.id}`, { data: { recurrence: daily, habit: true } })).ok()).toBe(true);

    // Marked from the drawer.
    await page.goto(`${team.url}?task=${walk.id}`);
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${walk.id}`) && r.request().method() === "PATCH");
    await page.getByLabel(/Track as a habit/).check();
    await saved;

    await page.goto(`/w/${ws}/habits`);
    const walkCard = page.getByRole("group", { name: `Habit Walk ${id}` });
    const readCard = page.getByRole("group", { name: `Habit Read ${id}` });
    await expect(walkCard.getByLabel("Current streak 0, best 0")).toBeVisible();
    // Read is a day overdue: missed, so no streak.
    await expect(readCard.getByLabel("Current streak 0, best 0")).toBeVisible();

    // Done on its day: streak 1, and the next occurrence takes its place.
    await walkCard.getByRole("button", { name: /^Done/ }).click();
    await expect(walkCard.getByLabel("Current streak 1, best 1")).toBeVisible();
    await expect(walkCard.getByRole("button", { name: /^Done/ })).toBeVisible();

    // Done a day late: still no streak.
    await readCard.getByRole("button", { name: /^Done/ }).click();
    await expect(readCard.getByLabel("Current streak 0, best 0")).toBeVisible();
    await expect(readCard.getByRole("list", { name: "Recent" })).toContainText("done late");
  });
});
