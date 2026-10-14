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

function drawer(page: Page) {
  return page.locator("aside", { has: page.getByPlaceholder("Add a description…") });
}

test.describe("comment edit and delete", () => {
  test("the author edits and deletes their comment", async ({ page, team }) => {
    const task = await createTask(page.request, team.workspace.id, { title: `Comments ${uid()}`, projectId: team.project.id });
    const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}/comments`));
    await page.goto(`${team.url}?task=${task.id}`);
    await loaded;
    const panel = drawer(page);

    await panel.getByPlaceholder("Write a comment…").fill("First draft");
    await panel.getByRole("button", { name: "Comment", exact: true }).click();
    // By id: once editing, the text sits in a textarea and no longer matches hasText.
    const comment = panel.locator('li[id^="comment-"]:not([id^="comment-tmp-"])');
    await expect(comment).toContainText("First draft");

    await comment.hover();
    await comment.getByRole("button", { name: "Edit comment" }).click();
    const editor = comment.getByRole("combobox");
    await editor.fill("Second draft");
    await comment.getByRole("button", { name: "Save" }).click();
    const edited = comment;
    await expect(edited).toContainText("Second draft");
    await expect(edited).toContainText("edited");
    await expect(panel.getByText("First draft")).toHaveCount(0);

    page.once("dialog", (dialog) => void dialog.accept());
    await edited.hover();
    await edited.getByRole("button", { name: "Delete comment" }).click();
    await expect(panel.getByText("Second draft")).toHaveCount(0);

    await page.reload();
    await expect(drawer(page).getByText("No comments yet.")).toBeVisible();
  });

  test("members can't edit others' comments; admins can delete them", async ({ page, team, browser }) => {
    const member = await pageAs(browser, "member");
    await join(page, member, team);
    const task = await createTask(page.request, team.workspace.id, { title: `Moderate ${uid()}`, projectId: team.project.id });

    const ownerComment = (await (await page.request.post(`/api/tasks/${task.id}/comments`, { data: { body: "Owner says" } })).json()).comment;
    expect((await member.request.patch(`/api/comments/${ownerComment.id}`, { data: { body: "Hijacked" } })).status()).toBe(403);
    expect((await member.request.delete(`/api/comments/${ownerComment.id}`)).status()).toBe(403);

    const memberComment = (await (await member.request.post(`/api/tasks/${task.id}/comments`, { data: { body: "Member says" } })).json()).comment;
    expect((await page.request.patch(`/api/comments/${memberComment.id}`, { data: { body: "Owner edit" } })).status()).toBe(403);
    expect((await page.request.delete(`/api/comments/${memberComment.id}`)).ok()).toBe(true);

    const { comments } = await (await page.request.get(`/api/tasks/${task.id}/comments`)).json();
    expect(comments.map((c: { body: string }) => c.body)).toEqual(["Owner says"]);
    await member.context().close();
  });
});

test.describe("trash", () => {
  test("undo brings a deleted task straight back", async ({ page, team }) => {
    const title = `Undo ${uid()}`;
    await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await openList(page, team.url);

    await taskRow(page, title).getByRole("button", { name: "Delete" }).click();
    await expect(taskRow(page, title)).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(taskRow(page, title)).toBeVisible();
  });

  test("deleted tasks are listed in Trash and can be restored", async ({ page, team }) => {
    const title = `Trashed ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    expect((await page.request.delete(`/api/tasks/${task.id}`)).ok()).toBe(true);

    await page.goto(`/w/${team.workspace.id}/trash`);
    const row = page.locator("li", { hasText: title });
    await expect(row).toContainText(team.project.name);
    await row.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText(`Restored “${title}”.`)).toBeVisible();
    await expect(page.getByText("The trash is empty.")).toBeVisible();

    await openList(page, team.url);
    await expect(taskRow(page, title)).toBeVisible();
  });

  test("a task from a deleted project comes back in the Inbox", async ({ page, team }) => {
    const { project } = await (await page.request.post(`/api/workspaces/${team.workspace.id}/projects`, { data: { name: `Doomed ${uid()}` } })).json();
    const task = await createTask(page.request, team.workspace.id, { title: `Orphan ${uid()}`, projectId: project.id });
    expect((await page.request.delete(`/api/projects/${project.id}`)).ok()).toBe(true);

    const restored = await (await page.request.post(`/api/tasks/${task.id}/restore`)).json();
    expect(restored.task.projectId).toBeNull();
    expect(restored.task.deletedAt).toBeNull();
  });
});

test.describe("board columns", () => {
  test("add a column from the board and move cards into it", async ({ page, team }) => {
    const title = `Card ${uid()}`;
    await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await page.goto(team.url);
    await expect(page.getByRole("heading", { name: "Todo", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Add column" }).click();
    await page.getByLabel("Column name").fill("Review");
    await page.getByLabel("Cards here are").selectOption("in_progress");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();

    const { project } = await (await page.request.get(`/api/projects/${team.project.id}`)).json();
    expect(project.columns.map((c: { name: string }) => c.name)).toEqual(["Todo", "In progress", "Done", "Review"]);
  });

  test("columns can be renamed, reordered and deleted; each status keeps one", async ({ page, team }) => {
    const created = await (await page.request.post(`/api/projects/${team.project.id}/columns`, { data: { name: "Review", statusMapped: "in_progress" } })).json();
    const [todo, doing, done, review] = created.columns as Array<{ id: string; name: string }>;

    // The only Done column can't go.
    const lastDone = await page.request.delete(`/api/columns/${done!.id}`);
    expect(lastDone.status()).toBe(409);

    // A card in Review moves to In progress when Review is deleted.
    const task = await createTask(page.request, team.workspace.id, { title: `Reviewing ${uid()}`, projectId: team.project.id });
    expect((await page.request.post(`/api/projects/${team.project.id}/reorder`, {
      data: { moves: [{ taskId: task.id, columnId: review!.id, position: 1000, status: "in_progress" }] },
    })).ok()).toBe(true);

    const reordered = await (await page.request.patch(`/api/projects/${team.project.id}/columns`, {
      data: { columnIds: [todo!.id, review!.id, doing!.id, done!.id] },
    })).json();
    expect(reordered.columns.map((c: { name: string }) => c.name)).toEqual(["Todo", "Review", "In progress", "Done"]);

    const renamed = await (await page.request.patch(`/api/columns/${review!.id}`, { data: { name: "QA" } })).json();
    expect(renamed.columns[1].name).toBe("QA");

    expect((await page.request.delete(`/api/columns/${review!.id}`)).ok()).toBe(true);
    const after = (await (await page.request.get(`/api/tasks/${task.id}`)).json()).task;
    expect(after.columnId).toBe(doing!.id);
    expect(after.status).toBe("in_progress");
  });
});

test.describe("notifications", () => {
  test("assigning and mentioning a member shows up in their bell", async ({ page, team, browser }) => {
    const member = await pageAs(browser, "member");
    await join(page, member, team);
    const memberId = await myId(member);
    await member.request.post("/api/notifications/read", { data: {} });

    const title = `Notify ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    expect((await page.request.patch(`/api/tasks/${task.id}`, { data: { assigneeIds: [memberId] } })).ok()).toBe(true);
    const tag = `@${USERS.member.name}`;
    expect((await page.request.post(`/api/tasks/${task.id}/comments`, {
      data: { body: `${tag} please look`, mentions: [{ userId: memberId, start: 0, end: tag.length }] },
    })).ok()).toBe(true);

    await member.goto(team.url);
    const bell = member.getByRole("button", { name: /^Notifications, 2 unread$/ });
    await expect(bell).toBeVisible();
    await bell.click();
    const panel = member.getByRole("dialog", { name: "Notifications" });
    await expect(panel.getByText(`${USERS.owner.name} assigned you`)).toBeVisible();
    await expect(panel.getByText(`${USERS.owner.name} mentioned you on`)).toBeVisible();

    await panel.getByRole("button", { name: /assigned you/ }).click();
    await expect(member).toHaveURL(new RegExp(`[?&]task=${task.id}`));
    await expect(member.getByRole("button", { name: /^Notifications, 1 unread$/ })).toBeVisible();

    // The owner did both, so the owner's bell stays quiet for this task.
    const own = await (await page.request.get("/api/notifications")).json();
    expect(own.items.some((n: { taskId: string }) => n.taskId === task.id)).toBe(false);
    await member.context().close();
  });
});
