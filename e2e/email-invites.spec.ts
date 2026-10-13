import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, pageAs, test } from "./fixtures";
import { E2E_INVITE_OUTBOX, USERS } from "./env";
import type { Page } from "@playwright/test";

type OutboxEmail = { to: string; subject: string; text: string; url: string };

/** The newest invite email the server wrote for this address. */
async function latestEmailTo(to: string): Promise<OutboxEmail> {
  let found: OutboxEmail | null = null;
  await expect
    .poll(async () => {
      const files = (await readdir(E2E_INVITE_OUTBOX).catch(() => [] as string[]))
        .filter((name) => name.endsWith(".json"))
        .sort();
      for (const name of files.reverse()) {
        const email = JSON.parse(await readFile(path.join(E2E_INVITE_OUTBOX, name), "utf8")) as OutboxEmail;
        if (email.to === to) {
          found = email;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return found!;
}

async function sendInvite(owner: Page, workspaceId: string, email: string, role = "member") {
  await owner.goto(`/w/${workspaceId}/members`);
  await owner.getByLabel("Email address").fill(email);
  await owner.getByLabel("Role for emailed invite").selectOption(role);
  await owner.getByRole("button", { name: "Send invite" }).click();
}

test.describe("invite by email", () => {
  test("the invitee gets an email and joins from its link", async ({ page, team, browser }) => {
    await sendInvite(page, team.workspace.id, USERS.member.email, "viewer");
    await expect(page.getByRole("status")).toHaveText(`Invitation sent to ${USERS.member.email}`);

    const email = await latestEmailTo(USERS.member.email);
    expect(email.subject).toContain(team.workspace.name);
    expect(email.text).toContain("as a viewer");
    expect(email.url).toMatch(/\/invite\/[\w-]+$/);

    const member = await pageAs(browser, "member");
    await member.goto(new URL(email.url).pathname);
    await expect(member).toHaveURL(new RegExp(`/w/${team.workspace.id}`));
    await expect(member.getByText(`You've joined ${team.workspace.name}`)).toBeVisible();
    // Shown once: the flag is dropped from the URL, so a reload is quiet.
    await expect(member).not.toHaveURL(/joined=/);
    await member.reload();
    await expect(member.getByText(`You've joined ${team.workspace.name}`)).toHaveCount(0);

    await page.reload();
    const row = page.locator("tr", { hasText: USERS.member.email });
    await expect(row.locator("select")).toHaveValue("viewer");
    await member.context().close();
  });

  test("an emailed invite only works for that address", async ({ page, team, browser }) => {
    const intended = `someone-else-${Date.now()}@e2e.test`;
    await sendInvite(page, team.workspace.id, intended);
    await expect(page.getByRole("status")).toHaveText(`Invitation sent to ${intended}`);
    const email = await latestEmailTo(intended);

    const member = await pageAs(browser, "member");
    await member.goto(new URL(email.url).pathname);
    await expect(member.getByRole("heading", { name: "Invite failed" })).toBeVisible();
    await expect(member.getByText(`This invite was sent to ${intended}`)).toBeVisible();

    const members = await page.request.get(`/api/workspaces/${team.workspace.id}/members`);
    expect(JSON.stringify(await members.json())).not.toContain(USERS.member.email);
    await member.context().close();
  });

  test("inviting someone who is already a member says so", async ({ page, team }) => {
    await sendInvite(page, team.workspace.id, USERS.owner.email);
    await expect(page.getByText(`${USERS.owner.email} is already a member`)).toBeVisible();
  });

  test("opening an invite to a workspace you're already in says so", async ({ page, team }) => {
    await page.goto(`/w/${team.workspace.id}/members`);
    await page.getByRole("button", { name: "Generate link" }).click();
    const link = await page.locator("input[readonly]").inputValue();
    await page.goto(new URL(link).pathname);
    await expect(page.getByText(`You're already in ${team.workspace.name}`)).toBeVisible();
  });

  test("the invite link option is still there", async ({ page, team }) => {
    await page.goto(`/w/${team.workspace.id}/members`);
    await page.getByRole("button", { name: "Generate link" }).click();
    await expect(page.locator("input[readonly]")).toHaveValue(/\/invite\/[\w-]+$/);
  });
});
