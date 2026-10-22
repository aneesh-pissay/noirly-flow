import { createTask, expect, test, uid } from "./fixtures";

/** A local date `offset` days from today, date-only as the API takes it. */
function day(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test.describe("gantt", () => {
  test("bars from start to due, dependency arrows, and dragging to reschedule", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const design = await createTask(page.request, ws, { title: `Design ${id}`, projectId: team.project.id, startAt: day(1), dueAt: day(3) });
    const build = await createTask(page.request, ws, { title: `Build ${id}`, projectId: team.project.id, dueAt: day(5) });
    expect((await page.request.patch(`/api/tasks/${build.id}`, { data: { blockedByIds: [design.id] } })).ok()).toBe(true);
    await createTask(page.request, ws, { title: `Someday ${id}`, projectId: team.project.id });
    const get = async (taskId: string) => (await (await page.request.get(`/api/tasks/${taskId}`)).json()).task;
    const dayPx = 28;

    await page.goto(team.url);
    await page.getByRole("button", { name: "Gantt", exact: true }).click();
    const designBar = page.getByRole("button", { name: new RegExp(`^Design ${id}: `) });
    const buildBar = page.getByRole("button", { name: new RegExp(`^Build ${id}: `) });
    await expect(designBar).toBeVisible();
    await expect(buildBar).toBeVisible();
    // Design is three days wide; Build waits on it, so there's an arrow.
    expect(Math.round((await designBar.boundingBox())!.width / dayPx)).toBe(3);
    await expect(page.locator('svg path[marker-end="url(#gantt-arrow)"]')).toHaveCount(1);
    await expect(page.getByText("No dates · 1")).toBeVisible();

    // Drag Design's end two days later.
    let box = (await designBar.boundingBox())!;
    await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 2 + 2 * dayPx, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => new Date((await get(design.id)).dueAt).getDate()).toBe(new Date(`${day(5)}T12:00:00`).getDate());

    // Move Build a day earlier.
    box = (await buildBar.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - dayPx, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => new Date((await get(build.id)).dueAt).getDate()).toBe(new Date(`${day(4)}T12:00:00`).getDate());
  });
});
