import { createTask, expect, test, uid } from "./fixtures";

/** A local calendar day, `offset` days from today, as the API's date-only form. */
function day(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test.describe("today and upcoming", () => {
  test("gather open tasks across projects and the Inbox by day", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const make = (title: string, extra: Record<string, unknown>) =>
      createTask(page.request, ws, { title: `${title} ${id}`, projectId: team.project.id, ...extra });

    await make("Late", { dueAt: day(-2) });
    await make("Now", { dueAt: day(0) });
    await createTask(page.request, ws, { title: `Inbox now ${id}`, projectId: null, dueAt: day(0) });
    await make("Finished", { dueAt: day(0), status: "done" });
    await make("Soon", { dueAt: day(1) });
    await make("Later", { dueAt: day(3) });
    await make("Far", { dueAt: day(20) });
    // A deleted project's tasks are hidden everywhere.
    const { project: doomed } = await (await page.request.post(`/api/workspaces/${ws}/projects`, { data: { name: `Doomed ${id}` } })).json();
    await createTask(page.request, ws, { title: `Gone ${id}`, projectId: doomed.id, dueAt: day(0) });
    expect((await page.request.delete(`/api/projects/${doomed.id}`)).ok()).toBe(true);

    await page.goto(team.url);
    await page.getByRole("link", { name: "Today", exact: true }).click();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    const overdue = page.getByRole("group", { name: /Overdue/ });
    const today = page.getByRole("group", { name: /^Today/ });
    await expect(overdue).toContainText(`Late ${id}`);
    await expect(today).toContainText(`Now ${id}`);
    await expect(today).toContainText(`Inbox now ${id}`);
    for (const absent of ["Finished", "Soon", "Gone"]) {
      await expect(page.getByText(`${absent} ${id}`)).toHaveCount(0);
    }

    await page.getByRole("button", { name: `Complete Now ${id}` }).click();
    await expect(page.getByText(`Now ${id}`, { exact: true })).toHaveCount(0);
    const { tasks } = await (await page.request.get(`/api/workspaces/${ws}/tasks?status=done`)).json();
    expect((tasks as Array<{ title: string }>).map((t) => t.title)).toContain(`Now ${id}`);

    await page.getByRole("link", { name: "Upcoming", exact: true }).click();
    await expect(page).toHaveURL(/\/upcoming$/);
    await expect(page.getByRole("group", { name: /^Tomorrow/ })).toContainText(`Soon ${id}`);
    await expect(page.getByText(`Later ${id}`)).toBeVisible();
    for (const absent of ["Far", "Late", "Inbox now"]) {
      await expect(page.getByText(`${absent} ${id}`)).toHaveCount(0);
    }
  });
});
