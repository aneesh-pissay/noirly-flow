import { createTask, expect, test, uid } from "./fixtures";

test.describe("time tracking", () => {
  test("a timer from the drawer, time added by hand, and one timer at a time", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const task = await createTask(page.request, ws, { title: `Report ${id}`, projectId: team.project.id });
    const other = await createTask(page.request, ws, { title: `Other ${id}`, projectId: team.project.id });
    await page.request.post("/api/me/time/stop");

    await page.goto(`${team.url}?task=${task.id}`);
    const time = page.locator("aside").getByRole("region", { name: "Time" });
    await time.getByRole("button", { name: "Start timer" }).click();

    // The header shows what's running; stopping it there finishes the entry.
    const chip = page.getByRole("region", { name: "Running timer" });
    await expect(chip).toContainText(`Report ${id}`);
    await expect(time.getByRole("button", { name: /^Stop/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await chip.getByRole("button", { name: "Stop timer" }).click();
    await expect(chip).toHaveCount(0);
    await page.goto(`${team.url}?task=${task.id}`);
    await expect(time).toContainText("1m tracked");

    // By hand.
    await time.getByLabel("Time spent").fill("1h 30m");
    await time.getByLabel("Note").fill("Drafting");
    await time.getByRole("button", { name: "Add time" }).click();
    await expect(time).toContainText("1h 31m tracked");
    await expect(time.getByRole("list", { name: "Time entries" })).toContainText("Drafting");
    await time.getByLabel("Time spent").fill("soon");
    await expect(time.getByRole("button", { name: "Add time" })).toBeDisabled();

    // Deleting an entry takes it off the total.
    await time.getByRole("button", { name: "Delete 1h 30m entry" }).click();
    await expect(time).toContainText("1m tracked");

    // Starting a timer elsewhere finishes this one.
    expect((await page.request.post(`/api/tasks/${task.id}/time/start`)).ok()).toBe(true);
    expect((await page.request.post(`/api/tasks/${other.id}/time/start`)).ok()).toBe(true);
    const { running } = await (await page.request.get("/api/me/time")).json();
    expect(running.entry.taskId).toBe(other.id);
    const { entries } = await (await page.request.get(`/api/tasks/${task.id}/time`)).json();
    expect(entries.every((entry: { endedAt: string | null }) => entry.endedAt)).toBe(true);
    await page.request.post("/api/me/time/stop");
  });
});
