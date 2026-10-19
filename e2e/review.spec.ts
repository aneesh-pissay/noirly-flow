import { createTask, expect, test, uid } from "./fixtures";

/** Local noon `offset` days from today, as an instant. */
function noon(offset: number) {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, 12).toISOString();
}

test.describe("review", () => {
  test("daily and weekly reviews show what's done and move what's left", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const make = (title: string, dueAt: string | null, status?: string) =>
      createTask(page.request, ws, { title: `${title} ${id}`, projectId: team.project.id, dueAt, ...(status ? { status } : {}) });
    const finished = await make("Finished", noon(0));
    expect((await page.request.patch(`/api/tasks/${finished.id}`, { data: { status: "done" } })).ok()).toBe(true);
    await make("Behind", noon(-2));
    await make("Leftover", noon(0));
    await make("Someday", null);

    // The list API can ask for tasks completed since an instant.
    const since = async (at: string) =>
      (await (await page.request.get(`/api/workspaces/${ws}/tasks?status=done&completedAfter=${encodeURIComponent(at)}`)).json()).tasks.length;
    expect(await since(noon(-1))).toBe(1);
    expect(await since(noon(1))).toBe(0);

    await page.goto(`/w/${ws}/review`);
    await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
    await expect(page.getByText("Not reviewed yet")).toBeVisible();
    await expect(page.getByRole("group", { name: /Done today/ })).toContainText(`Finished ${id}`);
    await expect(page.getByRole("group", { name: /Overdue/ })).toContainText(`Behind ${id}`);

    await page.getByRole("button", { name: `Tomorrow: Leftover ${id}` }).click();
    await expect(page.getByRole("group", { name: /^Tomorrow/ })).toContainText(`Leftover ${id}`);
    await expect(page.getByRole("group", { name: /Still open today/ })).toHaveCount(0);

    await page.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(page.getByText(/Last reviewed/)).toBeVisible();
    await page.screenshot({ path: "test-results/review-daily.png", fullPage: true });

    await page.getByRole("button", { name: "Weekly" }).click();
    await expect(page.getByRole("group", { name: /Done this week/ })).toContainText(`Finished ${id}`);
    await expect(page.getByRole("group", { name: /No date/ })).toContainText(`Someday ${id}`);
    await page.getByRole("button", { name: `Next week: Someday ${id}` }).click();
    await expect(page.getByRole("group", { name: /No date/ })).toHaveCount(0);
    await expect(page.locator(`[data-task-row="Someday ${id}"]`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Next week: Someday ${id}` })).toHaveCount(0);
    await page.screenshot({ path: "test-results/review-weekly.png", fullPage: true });

    // The reviewed time survives a reload.
    await page.reload();
    await expect(page.getByText(/Last reviewed/)).toBeVisible();
  });
});
