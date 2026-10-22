import type { Page } from "@playwright/test";
import { createTask, expect, openList, pageAs, taskRow, test, uid, type Team } from "./fixtures";
import { USERS } from "./env";

async function join(owner: Page, member: Page, team: Team, role: "member" | "viewer" = "member") {
  const created = await owner.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role } });
  const { invite } = (await created.json()) as { invite: { token: string } };
  expect((await member.request.post("/api/invites/accept", { data: { token: invite.token } })).ok()).toBe(true);
}

async function myId(page: Page) {
  return ((await (await page.request.get("/api/me")).json()) as { user: { id: string } }).user.id;
}

test.describe("approvals", () => {
  test("request, request changes, approve, then the task can be done", async ({ page, team, browser }) => {
    const id = uid();
    const member = await pageAs(browser, "member");
    await join(page, member, team);
    const memberId = await myId(member);
    await member.request.post("/api/notifications/read", { data: {} });
    const task = await createTask(page.request, team.workspace.id, { title: `Contract ${id}`, projectId: team.project.id });

    // The owner asks the member to approve.
    await openList(page, team.url);
    await page.getByRole("button", { name: `Contract ${id}` }).click();
    await page.getByLabel("Approver").selectOption({ label: USERS.member.name });
    await page.getByRole("button", { name: "Request approval" }).click();
    await expect(page.getByText(`Waiting on ${USERS.member.name}, asked by ${USERS.owner.name}.`)).toBeVisible();
    await page.screenshot({ path: "test-results/approval-requested.png" });
    await page.keyboard.press("Escape");
    await expect(taskRow(page, `Contract ${id}`)).toContainText("Awaiting approval");

    // It can't be finished yet.
    const done = await page.request.patch(`/api/tasks/${task.id}`, { data: { status: "done" } });
    expect(done.status()).toBe(409);
    expect(await done.json()).toMatchObject({ error: "needs_approval", message: expect.stringContaining("needs approval") });
    // Only the approver decides.
    expect((await page.request.post(`/api/tasks/${task.id}/approval/decision`, { data: { decision: "approve" } })).status()).toBe(403);

    // The member hears about it and asks for changes.
    await member.goto(team.url);
    const bell = member.getByRole("button", { name: /^Notifications, 1 unread$/ });
    await bell.click();
    await member.getByRole("dialog", { name: "Notifications" }).getByRole("button", { name: /asked you to approve/ }).filter({ hasText: `Contract ${id}` }).click();
    await member.getByLabel("Note (optional)").fill("Add the payment terms");
    await member.getByRole("button", { name: "Request changes" }).click();
    await expect(member.getByText(`${USERS.member.name} requested changes.`)).toBeVisible();
    await expect(member.getByText("Add the payment terms", { exact: true })).toBeVisible();
    await member.screenshot({ path: "test-results/approval-changes.png" });

    // The owner sees it, asks again, and the member approves.
    await openList(page, team.url);
    await expect(taskRow(page, `Contract ${id}`)).toContainText("Changes requested");
    const notes = await (await page.request.get("/api/notifications")).json();
    expect(notes.items.some((n: { taskId: string; kind: string }) => n.taskId === task.id && n.kind === "approval_rejected")).toBe(true);
    expect((await page.request.post(`/api/tasks/${task.id}/approval`, { data: { approverId: memberId } })).status()).toBe(201);
    expect((await member.request.post(`/api/tasks/${task.id}/approval/decision`, { data: { decision: "approve" } })).ok()).toBe(true);
    await openList(page, team.url);
    await expect(taskRow(page, `Contract ${id}`)).toContainText("Approved");
    expect((await page.request.patch(`/api/tasks/${task.id}`, { data: { status: "done" } })).ok()).toBe(true);

    // The activity log tells the story.
    const activity = await (await page.request.get(`/api/workspaces/${team.workspace.id}/activity?taskId=${task.id}`)).json();
    const verbs = (activity.events ?? activity.items ?? []).map((event: { verb: string }) => event.verb);
    expect(verbs).toEqual(expect.arrayContaining(["approval.requested", "approval.rejected", "approval.approved"]));
    await member.context().close();
  });

  test("approvers must be editors, not yourself, and viewers can't request", async ({ page, team, browser }) => {
    const viewer = await pageAs(browser, "member");
    await join(page, viewer, team, "viewer");
    const viewerId = await myId(viewer);
    const ownerId = await myId(page);
    const task = await createTask(page.request, team.workspace.id, { title: `Memo ${uid()}`, projectId: team.project.id });
    const ask = (from: Page, approverId: string) => from.request.post(`/api/tasks/${task.id}/approval`, { data: { approverId } });
    expect((await ask(page, ownerId)).status()).toBe(400);
    expect((await ask(page, viewerId)).status()).toBe(400);
    expect((await ask(viewer, ownerId)).status()).toBe(403);
    await viewer.context().close();
  });
});
