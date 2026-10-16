import { createTask, expect, openList, taskRow, test, uid } from "./fixtures";
import type { Page } from "@playwright/test";

function drawer(page: Page) {
  return page.locator("aside", { has: page.getByPlaceholder("Add a description…") });
}

test.describe("task drawer", () => {
  test("opens from the list with ?task= and closes with Escape", async ({ page, team }) => {
    const title = `Drawer ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await openList(page, team.url);

    await taskRow(page, title).getByRole("button", { name: title }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]task=${task.id}`));
    await expect(drawer(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]task=/);
  });

  test("a ?task= deep link opens the drawer", async ({ page, team }) => {
    const title = `Deep ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await page.goto(`${team.url}?task=${task.id}`);
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).locator("input").first()).toHaveValue(title);
  });

  test("a due time is saved, shown in the list, and can be removed", async ({ page, team }) => {
    const title = `Timed ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id, dueAt: "2026-12-24" });
    const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "GET");
    await page.goto(`${team.url}?task=${task.id}`);
    await loaded;

    const time = drawer(page).getByLabel("Due time (optional)");
    const saved = () => page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "PATCH");
    let patched = saved();
    await time.fill("15:30");
    await time.press("Enter");
    await patched;

    const timed = (await (await page.request.get(`/api/tasks/${task.id}`)).json()).task;
    expect(timed.dueHasTime).toBe(true);
    const due = new Date(timed.dueAt);
    expect([due.getFullYear(), due.getMonth(), due.getDate(), due.getHours(), due.getMinutes()]).toEqual([2026, 11, 24, 15, 30]);

    await page.keyboard.press("Escape");
    await openList(page, team.url);
    await expect(taskRow(page, title)).toContainText("3:30");

    // A date sent without the flag, as older clients do, is all-day again.
    await page.request.patch(`/api/tasks/${task.id}`, { data: { dueAt: "2026-12-25" } });
    expect((await (await page.request.get(`/api/tasks/${task.id}`)).json()).task.dueHasTime).toBe(false);

    await page.goto(`${team.url}?task=${task.id}`);
    patched = saved();
    await time.fill("09:00");
    await time.press("Enter");
    await patched;
    patched = saved();
    await time.fill("");
    await time.blur();
    await patched;
    expect((await (await page.request.get(`/api/tasks/${task.id}`)).json()).task.dueHasTime).toBe(false);
  });

  test("a start date shows until it arrives and moves with a recurring task", async ({ page, team }) => {
    const title = `Starts later ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id, startAt: "2099-01-05", dueAt: "2099-01-10" });
    await openList(page, team.url);
    await expect(taskRow(page, title)).toContainText(/Starts Jan 5/i);

    await page.goto(`${team.url}?task=${task.id}`);
    await expect(drawer(page).getByText("Start date", { exact: true })).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: /Jan 5, 2099/ })).toBeVisible();

    // Completing a weekly task makes the next copy, starting 5 days before its new due date.
    expect((await page.request.patch(`/api/tasks/${task.id}`, { data: { recurrence: { frequency: "weekly", interval: 1 } } })).ok()).toBe(true);
    expect((await page.request.patch(`/api/tasks/${task.id}`, { data: { status: "done" } })).ok()).toBe(true);
    const { tasks } = await (await page.request.get(`/api/workspaces/${team.workspace.id}/tasks?projectId=${team.project.id}`)).json();
    const next = (tasks as Array<{ id: string; title: string; dueAt: string; startAt: string }>).find((t) => t.title === title && t.id !== task.id)!;
    expect(next).toBeTruthy();
    expect(Date.parse(next.dueAt) - Date.parse(next.startAt)).toBe(5 * 86_400_000);
    expect(new Date(next.dueAt).getDate()).toBe(17);
  });

  test("a deadline is shown, marked once passed, and moves with a recurring task", async ({ page, team }) => {
    const id = uid();
    const past = await createTask(page.request, team.workspace.id, { title: `Missed ${id}`, projectId: team.project.id, deadlineAt: "2020-03-01" });
    const ahead = await createTask(page.request, team.workspace.id, { title: `Ahead ${id}`, projectId: team.project.id, dueAt: "2099-01-10", deadlineAt: "2099-01-12" });
    await openList(page, team.url);
    await expect(taskRow(page, `Missed ${id}`)).toContainText(/Deadline passed/i);
    await expect(taskRow(page, `Ahead ${id}`)).toContainText(/Deadline Jan 12/i);

    await page.goto(`${team.url}?task=${past.id}`);
    await expect(drawer(page).getByText("Deadline", { exact: true })).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: /Mar 1, 2020/ })).toBeVisible();

    // The next weekly copy keeps its deadline two days after its new due date.
    expect((await page.request.patch(`/api/tasks/${ahead.id}`, { data: { recurrence: { frequency: "weekly", interval: 1 } } })).ok()).toBe(true);
    expect((await page.request.patch(`/api/tasks/${ahead.id}`, { data: { status: "done" } })).ok()).toBe(true);
    const { tasks } = await (await page.request.get(`/api/workspaces/${team.workspace.id}/tasks?projectId=${team.project.id}`)).json();
    const next = (tasks as Array<{ id: string; title: string; dueAt: string; deadlineAt: string }>).find((t) => t.title === `Ahead ${id}` && t.id !== ahead.id)!;
    expect(Date.parse(next.deadlineAt) - Date.parse(next.dueAt)).toBe(2 * 86_400_000);
  });

  test("a duration is saved from the drawer and shown in the list", async ({ page, team }) => {
    const title = `Estimate ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "GET");
    await page.goto(`${team.url}?task=${task.id}`);
    await loaded;

    const patched = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "PATCH");
    await drawer(page).getByLabel("Duration").selectOption("90");
    await patched;
    expect((await (await page.request.get(`/api/tasks/${task.id}`)).json()).task.durationMinutes).toBe(90);

    await page.keyboard.press("Escape");
    await openList(page, team.url);
    await expect(taskRow(page, title)).toContainText(/1h 30m/i);
  });

  test("a custom repeat is saved from the drawer and the next copy lands on its day", async ({ page, team }) => {
    const title = `Repeats ${uid()}`;
    // 2099-01-05 is a Monday.
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id, dueAt: "2099-01-05" });
    const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "GET");
    await page.goto(`${team.url}?task=${task.id}`);
    await loaded;
    const panel = drawer(page);
    const saved = () => page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "PATCH");

    let patched = saved();
    await panel.getByLabel("Repeat", { exact: true }).selectOption("custom");
    await patched;
    patched = saved();
    await panel.getByRole("button", { name: /^Thu/ }).click();
    await patched;
    patched = saved();
    await panel.getByLabel("Repeat every").fill("2");
    await panel.getByLabel("Repeat every").press("Enter");
    await patched;
    await expect(panel.getByText(/Every 2 weeks on Mon, Thu/)).toBeVisible();

    const rule = (await (await page.request.get(`/api/tasks/${task.id}`)).json()).task.recurrence;
    expect(rule).toMatchObject({ frequency: "weekly", interval: 2, byWeekday: [1, 4] });

    // Done on Monday the 5th → Thursday the 8th, same week.
    expect((await page.request.patch(`/api/tasks/${task.id}`, { data: { status: "done" } })).ok()).toBe(true);
    const { tasks } = await (await page.request.get(`/api/workspaces/${team.workspace.id}/tasks?projectId=${team.project.id}`)).json();
    const next = (tasks as Array<{ id: string; title: string; dueAt: string }>).find((t) => t.title === title && t.id !== task.id)!;
    expect(new Date(next.dueAt).getDate()).toBe(8);
  });

  test("title, description and comment all persist", async ({ page, team }) => {
    const id = uid();
    const task = await createTask(page.request, team.workspace.id, { title: `Old title ${id}`, projectId: team.project.id });
    // The drawer copies the task into its fields when the fetch lands, wiping
    // anything typed before then (known UX gap) — wait for it, as a person would.
    const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "GET");
    await page.goto(`${team.url}?task=${task.id}`);
    await loaded;
    const panel = drawer(page);
    await expect(panel).toBeVisible();

    const titleInput = panel.locator("input").first();
    await titleInput.fill(`New title ${id}`);
    await titleInput.blur();

    const description = panel.getByPlaceholder("Add a description…");
    await description.fill("Ship it behind a flag.");
    await description.blur();

    // Tags, checklists and subtasks were removed from the drawer (Repeat came back with full recurrence).
    for (const gone of ["Tags", "Checklist", "Subtasks"]) {
      await expect(panel.getByText(gone, { exact: true })).toHaveCount(0);
    }
    await expect(panel.getByPlaceholder("Add checklist item")).toHaveCount(0);
    await expect(panel.getByPlaceholder("Add subtask")).toHaveCount(0);
    await expect(panel.getByPlaceholder("New tag")).toHaveCount(0);

    await panel.getByPlaceholder("Write a comment…").fill("Looks good to me");
    await panel.getByRole("button", { name: "Comment" }).click();
    await expect(panel.getByText("Looks good to me")).toBeVisible();

    // Everything reloads from the server.
    await expect
      .poll(async () => (await (await page.request.get(`/api/tasks/${task.id}`)).json()).task?.title)
      .toBe(`New title ${id}`);
    await page.reload();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).locator("input").first()).toHaveValue(`New title ${id}`);
    await expect(drawer(page).getByPlaceholder("Add a description…")).toHaveValue("Ship it behind a flag.");
    await expect(drawer(page).getByText("Looks good to me")).toBeVisible();
  });
});
