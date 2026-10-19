import { createTask, expect, test, uid } from "./fixtures";

test.describe("focus timer", () => {
  test("runs from the drawer, pauses, survives a reload, and offers a break when done", async ({ page, team }) => {
    const title = `Deep work ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await page.clock.install();
    await page.goto(`${team.url}?task=${task.id}`);

    const drawer = page.locator("aside", { has: page.getByPlaceholder("Add a description…") });
    await drawer.getByLabel("Focus length").selectOption("15");
    await drawer.getByRole("button", { name: "Start focus" }).click();
    const timer = page.getByRole("region", { name: "Focus timer" });
    await expect(timer).toContainText(title);
    await expect(timer.getByLabel("Time left")).toHaveText("15:00");

    // The page clock keeps ticking in real time between steps, so allow a few seconds.
    await page.clock.fastForward("02:00");
    await expect(timer.getByLabel("Time left")).toHaveText(/^1[23]:\d\d$/);
    await timer.getByRole("button", { name: "Pause" }).click();
    await expect(timer).toContainText("paused");
    const held = await timer.getByLabel("Time left").textContent();
    await page.clock.fastForward("05:00");
    await expect(timer.getByLabel("Time left")).toHaveText(held!);
    await timer.getByRole("button", { name: "Resume" }).click();

    // It's kept in this browser, so a reload carries on.
    await page.reload();
    await expect(timer.getByLabel("Time left")).toHaveText(/^1[23]:\d\d$/);

    await page.clock.fastForward("14:00");
    await expect(timer.getByRole("status")).toHaveText("Focus session done.");
    await timer.getByRole("button", { name: "5-min break" }).click();
    await expect(timer).toContainText("Break");
    await expect(timer.getByLabel("Time left")).toHaveText("5:00");
    await timer.getByRole("button", { name: "Stop" }).click();
    await expect(timer).toHaveCount(0);
  });
});
