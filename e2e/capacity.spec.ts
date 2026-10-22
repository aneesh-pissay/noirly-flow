import { createTask, expect, pageAs, test, uid } from "./fixtures";

function todayAt(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

test.describe("capacity", () => {
  test("shows overload against a person's hours, warns in the drawer, and lets you set your own hours", async ({ page, team, browser }) => {
    const id = uid();
    const ws = team.workspace.id;
    const me = (await (await page.request.get("/api/me")).json()).user;
    // 8 hours every day, so the test doesn't depend on today being a weekday.
    expect((await page.request.put(`/api/workspaces/${ws}/members/${me.id}/capacity`, { data: { minutes: [480, 480, 480, 480, 480, 480, 480] } })).ok()).toBe(true);
    const big = await createTask(page.request, ws, { title: `Big push ${id}`, projectId: team.project.id });
    expect((await page.request.patch(`/api/tasks/${big.id}`, {
      data: { dueAt: todayAt(17), dueHasTime: true, durationMinutes: 600, assigneeIds: [me.id] },
    })).ok()).toBe(true);

    await page.goto(`/w/${ws}/capacity`);
    await expect(page.getByRole("heading", { level: 1, name: "Capacity" })).toBeVisible();
    const cell = page.getByRole("button", { name: new RegExp(`^${me.displayName}, .*: 10h of 8h, over by 2h$`) });
    await expect(cell).toBeVisible();
    await cell.click();
    await expect(page.getByRole("region", { name: "Tasks that day" })).toContainText(`Big push ${id}`);

    // The drawer warns too.
    await page.goto(`${team.url}?task=${big.id}`);
    await expect(page.getByText(/has 10h due .*, over their 8h by 2h/)).toBeVisible();

    // Raise my hours for today: no longer over.
    await page.goto(`/w/${ws}/capacity`);
    await page.getByRole("button", { name: "My hours" }).click();
    const todayName = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date());
    await page.getByLabel(`${todayName} hours`).fill("12");
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.getByRole("button", { name: new RegExp(`^${me.displayName}, .*: 10h of 12h$`) })).toBeVisible();

    // Someone else can't set my hours.
    const other = await pageAs(browser, "member");
    expect((await other.request.put(`/api/workspaces/${ws}/members/${me.id}/capacity`, { data: { minutes: [0, 0, 0, 0, 0, 0, 0] } })).status()).toBe(403);
    await other.context().close();
  });
});
