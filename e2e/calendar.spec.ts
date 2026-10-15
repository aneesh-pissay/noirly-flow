import { request as playwrightRequest, type Page } from "@playwright/test";
import { createTask, expect, pageAs, test, uid, type Team } from "./fixtures";
import { E2E_BASE_URL } from "./env";

async function join(owner: Page, member: Page, team: Team) {
  const created = await owner.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role: "member" } });
  const { invite } = (await created.json()) as { invite: { token: string } };
  expect((await member.request.post("/api/invites/accept", { data: { token: invite.token } })).ok()).toBe(true);
}

/** Fetches a feed the way a calendar app does: no cookies, no CSRF header. */
async function fetchFeed(url: string) {
  const anonymous = await playwrightRequest.newContext({ baseURL: E2E_BASE_URL });
  try {
    const response = await anonymous.get(new URL(url).pathname);
    return { status: response.status(), type: response.headers()["content-type"] ?? "", body: await response.text() };
  } finally {
    await anonymous.dispose();
  }
}

test.describe("calendar feed", () => {
  test("holds my dated tasks, and turning it off or replacing it kills the old link", async ({ page, team, browser }) => {
    const member = await pageAs(browser, "member");
    await join(page, member, team);
    const memberId = ((await (await member.request.get("/api/me")).json()) as { user: { id: string } }).user.id;

    const id = uid();
    await createTask(page.request, team.workspace.id, { title: `Mine ${id}`, projectId: team.project.id, dueAt: "2026-12-24" });
    await createTask(page.request, team.workspace.id, { title: `Undated ${id}`, projectId: team.project.id });
    const theirs = await createTask(page.request, team.workspace.id, { title: `Theirs ${id}`, projectId: team.project.id, dueAt: "2026-12-25" });
    expect((await page.request.patch(`/api/tasks/${theirs.id}`, { data: { assigneeIds: [memberId] } })).ok()).toBe(true);

    const created = await (await page.request.post("/api/me/calendar-feed")).json();
    expect(created.url).toMatch(/\/api\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);

    const feed = await fetchFeed(created.url);
    expect(feed.status).toBe(200);
    expect(feed.type).toContain("text/calendar");
    expect(feed.body).toContain(`SUMMARY:Mine ${id}`);
    expect(feed.body).not.toContain(`Undated ${id}`);
    expect(feed.body).not.toContain(`Theirs ${id}`);

    // The member's own feed has the task assigned to them.
    const memberFeed = await (await member.request.post("/api/me/calendar-feed")).json();
    const theirFeed = await fetchFeed(memberFeed.url);
    expect(theirFeed.body).toContain(`SUMMARY:Theirs ${id}`);
    expect(theirFeed.body).not.toContain(`Mine ${id}`);

    const replaced = await (await page.request.post("/api/me/calendar-feed")).json();
    expect((await fetchFeed(created.url)).status).toBe(404);
    expect((await fetchFeed(replaced.url)).status).toBe(200);

    expect((await page.request.delete("/api/me/calendar-feed")).ok()).toBe(true);
    expect((await fetchFeed(replaced.url)).status).toBe(404);
    expect((await (await page.request.get("/api/me/calendar-feed")).json()).enabled).toBe(false);
    await member.context().close();
  });

  test("Settings makes a link and offers Add to Google Calendar", async ({ page }) => {
    await page.request.delete("/api/me/calendar-feed");
    await page.goto("/settings");
    await page.getByRole("button", { name: "Create calendar link" }).click();

    const link = page.getByLabel(/Your private calendar link/);
    await expect(link).toHaveValue(/\/api\/calendar\/.+\.ics$/);
    const google = page.getByRole("link", { name: "Add to Google Calendar" });
    await expect(google).toHaveAttribute("href", /^https:\/\/calendar\.google\.com\/calendar\/r\?cid=webcal%3A%2F%2F/);

    await page.reload();
    await expect(page.getByText("A calendar link is active")).toBeVisible();
    await expect(page.getByRole("button", { name: "Make a new link" })).toBeVisible();
    await page.request.delete("/api/me/calendar-feed");
  });

  test("an unknown link is a plain 404", async () => {
    expect((await fetchFeed(`${E2E_BASE_URL}/api/calendar/${"a".repeat(43)}.ics`)).status).toBe(404);
    expect((await fetchFeed(`${E2E_BASE_URL}/api/calendar/nope.ics`)).status).toBe(404);
  });
});
