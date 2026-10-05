import { createTask, expect, test, uid, waitForTasks } from "./fixtures";
import type { Page } from "@playwright/test";

/** A board column: the container two levels above its <h3> title. */
function column(page: Page, name: string) {
  return page.getByRole("heading", { level: 3, name, exact: true }).locator("xpath=../..");
}

test.describe("board", () => {
  test("projects open on the board with Todo / In progress / Done", async ({ page, team }) => {
    const title = `Card ${uid()}`;
    await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await page.goto(team.url);
    await waitForTasks(page);

    for (const name of ["Todo", "In progress", "Done"]) {
      await expect(page.getByRole("heading", { level: 3, name, exact: true })).toBeVisible();
    }
    await expect(column(page, "Todo").getByText(title)).toBeVisible();
  });

  test("a status change moves the card to its column", async ({ page, team }) => {
    const title = `Mover ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await page.goto(team.url);
    await waitForTasks(page);
    await expect(column(page, "Todo").getByText(title)).toBeVisible();

    const patch = await page.request.patch(`/api/tasks/${task.id}`, { data: { status: "in_progress" } });
    expect(patch.ok()).toBe(true);
    await page.reload();
    await waitForTasks(page);
    await expect(column(page, "In progress").getByText(title)).toBeVisible();
    await expect(column(page, "Todo").getByText(title)).toHaveCount(0);
  });

  test("dragging a card to Done marks it done", async ({ page, team }) => {
    const title = `Drag me ${uid()}`;
    await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await page.goto(team.url);
    await waitForTasks(page);

    // Drag by the grip: the title button swallows pointerdown so a click opens the drawer.
    const card = column(page, "Todo").locator("li", { hasText: title }).getByText("⋮⋮");
    const target = column(page, "Done").getByText("Drop tasks here");
    const from = (await card.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
    await page.mouse.up();

    await expect(column(page, "Done").getByText(title)).toBeVisible();
    // Persisted as status=done, not just moved on screen.
    await expect
      .poll(async () => {
        const res = await page.request.get(`/api/workspaces/${team.workspace.id}/tasks?projectId=${team.project.id}`);
        const { tasks } = await res.json();
        return tasks.find((t: { title: string }) => t.title === title)?.status;
      })
      .toBe("done");
  });
});

test.describe("calendar", () => {
  test("dated tasks sit on their day, undated ones are listed apart", async ({ page, team }) => {
    const id = uid();
    const today = new Date();
    const dueAt = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 15, 12)).toISOString();
    await createTask(page.request, team.workspace.id, { title: `Dated ${id}`, projectId: team.project.id, dueAt });
    await createTask(page.request, team.workspace.id, { title: `Undated ${id}`, projectId: team.project.id });

    await page.goto(team.url);
    await waitForTasks(page);
    await page.getByRole("button", { name: "Calendar", exact: true }).click();

    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      await expect(page.getByText(day, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: `Dated ${id}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Undated ${id}`, exact: true })).toBeVisible();
  });
});
