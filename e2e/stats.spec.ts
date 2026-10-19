import { createTask, expect, test, uid } from "./fixtures";

function day(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test.describe("stats", () => {
  test("counts what you finished, how much was on time, what's overdue and time tracked", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const me = (await (await page.request.get("/api/me")).json()).user.id;
    const mine = async (title: string, dueAt: string, status?: string) => {
      const task = await createTask(page.request, ws, { title: `${title} ${id}`, projectId: team.project.id, dueAt });
      expect((await page.request.patch(`/api/tasks/${task.id}`, { data: { assigneeIds: [me], ...(status ? { status } : {}) } })).ok()).toBe(true);
      return task;
    };
    await mine("On time", day(0), "done");
    await mine("Late", day(-1), "done");
    await mine("Behind", day(-2));
    const tracked = await mine("Tracked", day(3));
    expect((await page.request.post(`/api/tasks/${tracked.id}/time`, { data: { minutes: 90 } })).ok()).toBe(true);

    await page.goto(`/w/${ws}/stats`);
    const summary = page.getByRole("list", { name: "Summary" });
    await expect(summary.getByRole("listitem").filter({ hasText: "Completed this week" })).toContainText("2");
    await expect(summary.getByRole("listitem").filter({ hasText: "On time, last 30 days" })).toContainText("50%");
    await expect(summary.getByRole("listitem").filter({ hasText: "Overdue now" })).toContainText("1");
    await expect(summary.getByRole("listitem").filter({ hasText: "Tracked this week" })).toContainText("1h 30m");

    await page.screenshot({ path: "test-results/stats-page.png", fullPage: true });

    // Each chart reads as a table too.
    const perDay = page.getByRole("figure", { name: /Completed per day/ });
    await expect(perDay.getByRole("listitem").last()).toHaveAttribute("aria-label", /: 2 completed$/);
    await perDay.getByRole("button", { name: "Show as table" }).click();
    await expect(perDay.getByRole("row").last()).toContainText("2");
  });
});
