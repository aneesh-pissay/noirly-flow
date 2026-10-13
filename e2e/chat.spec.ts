import { expect, pageAs, test, uid, type Team } from "./fixtures";
import type { Page } from "@playwright/test";

/** Adds the "member" user to the owner's team with the given role, via the API. */
async function join(owner: Page, member: Page, team: Team, role: "admin" | "member" | "viewer") {
  const created = await owner.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role } });
  const { invite } = (await created.json()) as { invite: { token: string } };
  expect((await member.request.post("/api/invites/accept", { data: { token: invite.token } })).ok()).toBe(true);
}

const chatUrl = (team: Team) => `/w/${team.workspace.id}/p/${team.project.id}/chat`;

test.describe("project chat", () => {
  test("open chat from the project and send a message", async ({ page, team }) => {
    await page.goto(team.url);
    await page.getByRole("link", { name: "Chat" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${team.project.id}/chat$`));
    await expect(page.getByText("No messages yet")).toBeVisible();

    const text = `Kickoff at 10 ${uid()}`;
    const box = page.getByLabel("Message", { exact: true });
    await box.fill(text);
    await box.press("Enter");
    await expect(page.getByRole("log").getByText(text)).toBeVisible();
    await expect(box).toHaveValue("");

    // Shift+Enter is a newline, not send.
    await box.fill("line one");
    await box.press("Shift+Enter");
    await expect(box).toHaveValue("line one\n");

    await page.reload();
    await expect(page.getByRole("log").getByText(text)).toBeVisible();
  });

  test("teammates see each other's messages without reloading", async ({ page, team, browser }) => {
    const member = await pageAs(browser, "member");
    await join(page, member, team, "member");

    await page.goto(chatUrl(team));
    await member.goto(chatUrl(team));

    const fromOwner = `Owner says hi ${uid()}`;
    await page.getByLabel("Message", { exact: true }).fill(fromOwner);
    await page.getByRole("button", { name: "Send" }).click();
    // Realtime is off in e2e, so this exercises the polling fallback.
    await expect(member.getByRole("log").getByText(fromOwner)).toBeVisible({ timeout: 10_000 });

    const fromMember = `Member replies ${uid()}`;
    await member.getByLabel("Message", { exact: true }).fill(fromMember);
    await member.getByLabel("Message", { exact: true }).press("Enter");
    await expect(page.getByRole("log").getByText(fromMember)).toBeVisible({ timeout: 10_000 });
    await member.context().close();
  });

  test("chats are per project", async ({ page, team }) => {
    const res = await page.request.post(`/api/workspaces/${team.workspace.id}/projects`, { data: { name: `Other ${uid()}` } });
    const { project } = (await res.json()) as { project: { id: string } };
    const text = `Only in General ${uid()}`;
    await page.request.post(`/api/projects/${team.project.id}/messages`, { data: { body: text } });

    await page.goto(`/w/${team.workspace.id}/p/${project.id}/chat`);
    await expect(page.getByText("No messages yet")).toBeVisible();
    await expect(page.getByText(text)).toHaveCount(0);
  });

  test("viewers read along but can't post", async ({ page, team, browser }) => {
    const viewer = await pageAs(browser, "member");
    await join(page, viewer, team, "viewer");
    const text = `For viewers ${uid()}`;
    await page.request.post(`/api/projects/${team.project.id}/messages`, { data: { body: text } });

    await viewer.goto(chatUrl(team));
    await expect(viewer.getByRole("log").getByText(text)).toBeVisible();
    await expect(viewer.getByLabel("Message", { exact: true })).toHaveCount(0);
    await expect(viewer.getByText("Viewers can read the chat but not post.")).toBeVisible();
    const post = await viewer.request.post(`/api/projects/${team.project.id}/messages`, { data: { body: "sneaky" } });
    expect(post.status()).toBe(403);
    await viewer.context().close();
  });

  test("authors delete their own messages; others can't, admins can", async ({ page, team, browser }) => {
    const member = await pageAs(browser, "member");
    await join(page, member, team, "member");
    const post = async (as: Page, body: string) =>
      ((await (await as.request.post(`/api/projects/${team.project.id}/messages`, { data: { body } })).json()) as {
        message: { id: string };
      }).message.id;

    const ownerMsg = await post(page, `Owner note ${uid()}`);
    const memberMsg = await post(member, `Member note ${uid()}`);

    // A plain member can't delete someone else's message…
    expect((await member.request.delete(`/api/projects/${team.project.id}/messages/${ownerMsg}`)).status()).toBe(403);
    // …but can delete their own, from the UI.
    await member.goto(chatUrl(team));
    const own = member.getByRole("listitem").filter({ hasText: "Member note" });
    await own.hover();
    await own.getByRole("button", { name: "Delete message" }).click();
    await expect(member.getByText("Member note")).toHaveCount(0);

    // The owner (an admin+) can moderate anyone's.
    const another = await post(member, `Off topic ${uid()}`);
    expect((await page.request.delete(`/api/projects/${team.project.id}/messages/${another}`)).status()).toBe(200);
    expect(memberMsg).toBeTruthy();
    await member.context().close();
  });

  test("long chats load older messages on demand", async ({ page, team }) => {
    for (let i = 0; i < 53; i++) {
      await page.request.post(`/api/projects/${team.project.id}/messages`, { data: { body: `Message number ${i}` } });
    }
    await page.goto(chatUrl(team));
    const log = page.getByRole("log");
    await expect(log.getByText("Message number 52", { exact: true })).toBeVisible();
    await expect(log.getByText("Message number 0", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Load earlier messages" }).click();
    await expect(log.getByText("Message number 0", { exact: true })).toBeAttached();
    await expect(page.getByRole("button", { name: "Load earlier messages" })).toHaveCount(0);
  });

  test("outsiders can't read a team's chat", async ({ team, browser }) => {
    const outsider = await pageAs(browser, "member");
    expect((await outsider.request.get(`/api/projects/${team.project.id}/messages`)).status()).toBe(403);
    await outsider.context().close();
  });
});
