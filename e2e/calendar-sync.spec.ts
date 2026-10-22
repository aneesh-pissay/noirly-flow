import type { Page } from "@playwright/test";
import { createTask, expect, test, uid } from "./fixtures";
import { E2E_FAKE_CALENDAR_PORT } from "./env";
import { FakeCalendar } from "./fake-calendar";

const fake = new FakeCalendar(E2E_FAKE_CALENDAR_PORT);

test.describe.configure({ mode: "serial" });
test.beforeAll(() => fake.start());
test.afterAll(() => fake.stop());

/** A day `offset` from today (UTC, as the test account has no time zone set). */
const day = (offset: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const noon = (offset: number) => `${day(offset)}T12:00:00.000Z`;

/** Sync now, waiting out a background run that may hold the lock. */
async function syncNow(page: Page, provider: "google" | "outlook") {
  let outcome: { pulled: number; pushed: number; removed: number } | null = null;
  await expect.poll(async () => {
    const response = await page.request.post(`/api/calendar-sync/${provider}/sync`);
    if (response.status() === 409) return false;
    expect(response.ok(), await response.text()).toBe(true);
    outcome = await response.json();
    return true;
  }, { timeout: 20_000 }).toBe(true);
  return outcome!;
}

const getTask = async (page: Page, id: string) => (await (await page.request.get(`/api/tasks/${id}`)).json()).task as {
  title: string; dueAt: string | null; dueHasTime: boolean; durationMinutes: number | null;
};

test.describe("two-way calendar sync", () => {
  test("Google: tasks go to a Flow calendar, and edits come back either way", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const allDay = await createTask(page.request, ws, { title: `Rent ${id}`, projectId: team.project.id, dueAt: noon(3) });
    const timed = await createTask(page.request, ws, { title: `Call ${id}`, projectId: team.project.id, dueAt: `${day(4)}T10:00:00.000Z` });
    await page.request.patch(`/api/tasks/${timed.id}`, { data: { dueHasTime: true, durationMinutes: 60 } });
    await createTask(page.request, ws, { title: `Done ${id}`, projectId: team.project.id, dueAt: noon(2), status: "done" });

    try {
      await page.goto("/settings");
      const google = page.locator('[data-calendar="google"]');
      await google.getByRole("link", { name: "Connect Google Calendar" }).click();
      await expect(page.getByText("Google Calendar is connected.")).toBeVisible();
      await expect(google).toContainText("sam@gmail.test");
      const status = await (await page.request.get("/api/calendar-sync")).text();
      expect(status).not.toMatch(/g-access|g-refresh/);

      await syncNow(page, "google");
      const events = () => fake.liveEvents("google");
      const eventFor = (title: string) => events().find((e) => e.body.summary === title)!;
      expect(fake.calendar("google")).not.toBeNull();
      expect(eventFor(`Rent ${id}`).body).toMatchObject({ start: { date: day(3) }, end: { date: day(4) } });
      expect(String(eventFor(`Rent ${id}`).body.description)).toContain(`/t/${allDay.id}`);
      expect(eventFor(`Call ${id}`).body).toMatchObject({ start: { dateTime: `${day(4)}T10:00:00.000Z` }, end: { dateTime: `${day(4)}T11:00:00.000Z` } });
      expect(events().some((e) => e.body.summary === `Done ${id}`)).toBe(false);

      // Moved and renamed in the calendar → the task follows.
      fake.editEvent("google", eventFor(`Rent ${id}`).id, { summary: `Rent (moved) ${id}`, start: { date: day(5) }, end: { date: day(6) } });
      expect((await syncNow(page, "google")).pulled).toBe(1);
      expect(await getTask(page, allDay.id)).toMatchObject({ title: `Rent (moved) ${id}`, dueAt: noon(5), dueHasTime: false });

      // Changed in Flow → the event follows.
      await page.request.patch(`/api/tasks/${timed.id}`, { data: { dueAt: `${day(6)}T15:00:00.000Z`, dueHasTime: true } });
      await syncNow(page, "google");
      expect(eventFor(`Call ${id}`).body).toMatchObject({ start: { dateTime: `${day(6)}T15:00:00.000Z` } });

      // Both changed: the later edit (the calendar's, here) wins.
      await page.request.patch(`/api/tasks/${timed.id}`, { data: { title: `Call (Flow) ${id}` } });
      fake.editEvent("google", eventFor(`Call ${id}`).id, { summary: `Call (calendar) ${id}` });
      await syncNow(page, "google");
      expect((await getTask(page, timed.id)).title).toBe(`Call (calendar) ${id}`);

      // Deleted in the calendar → the task loses its date, and stays.
      fake.deleteEvent("google", eventFor(`Call (calendar) ${id}`).id);
      await syncNow(page, "google");
      expect(await getTask(page, timed.id)).toMatchObject({ title: `Call (calendar) ${id}`, dueAt: null });

      // Done in Flow → the event goes.
      await page.request.patch(`/api/tasks/${allDay.id}`, { data: { status: "done" } });
      expect((await syncNow(page, "google")).removed).toBe(1);
      expect(events().some((e) => String(e.body.summary).includes(id))).toBe(false);
      await page.screenshot({ path: "test-results/calendar-sync.png", fullPage: true });
    } finally {
      await page.request.delete("/api/calendar-sync/google");
    }
    expect(fake.calendar("google")).toBeNull();
    await page.reload();
    await expect(page.locator('[data-calendar="google"]')).toContainText("Not connected.");
  });

  test("Outlook: all-day and timed events through Graph", async ({ page, team }) => {
    const id = uid();
    const task = await createTask(page.request, team.workspace.id, { title: `Review ${id}`, projectId: team.project.id, dueAt: noon(2) });
    try {
      await page.goto("/settings");
      await page.locator('[data-calendar="outlook"]').getByRole("link", { name: "Connect Outlook" }).click();
      await expect(page.getByText("Outlook is connected.")).toBeVisible();
      await syncNow(page, "outlook");
      const event = fake.liveEvents("outlook").find((e) => e.body.subject === `Review ${id}`)!;
      expect(event.body).toMatchObject({ isAllDay: true, start: { dateTime: `${day(2)}T00:00:00`, timeZone: "UTC" } });

      // Given a time in Outlook → the task becomes timed, as long as the event.
      fake.editEvent("outlook", event.id, { isAllDay: false, start: { dateTime: `${day(2)}T09:30:00`, timeZone: "UTC" }, end: { dateTime: `${day(2)}T10:15:00`, timeZone: "UTC" } });
      await syncNow(page, "outlook");
      expect(await getTask(page, task.id)).toMatchObject({ dueAt: `${day(2)}T09:30:00.000Z`, dueHasTime: true, durationMinutes: 45 });
    } finally {
      await page.request.delete("/api/calendar-sync/outlook");
    }
    expect(fake.calendar("outlook")).toBeNull();
  });

  test("refuses a callback that wasn't started here, and unknown calendars", async ({ page }) => {
    await page.goto("/api/calendar-sync/google/callback?code=x&state=forged");
    await expect(page).toHaveURL(/\/settings\?calendar=error/);
    await expect(page.getByText("Couldn't connect that calendar.")).toBeVisible();
    expect((await page.request.post("/api/calendar-sync/yahoo/sync")).status()).toBe(404);
    expect((await page.request.post("/api/calendar-sync/google/sync")).status()).toBe(404);
  });
});
