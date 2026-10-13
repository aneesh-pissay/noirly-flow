import { createTask, expect, pageAs, test, uid, type Team } from "./fixtures";
import type { Page } from "@playwright/test";

function drawer(page: Page) {
  return page.locator("aside", { has: page.getByPlaceholder("Add a description…") });
}

async function join(owner: Page, member: Page, team: Team, role: "member" | "viewer") {
  const created = await owner.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role } });
  const { invite } = (await created.json()) as { invite: { token: string } };
  expect((await member.request.post("/api/invites/accept", { data: { token: invite.token } })).ok()).toBe(true);
}

async function uploadVia(page: Page, taskId: string, name: string, mimeType: string, body: string | Buffer) {
  const res = await page.request.post(`/api/tasks/${taskId}/attachments`, {
    multipart: { file: { name, mimeType, buffer: Buffer.isBuffer(body) ? body : Buffer.from(body) } },
  });
  return res;
}

test.describe("task attachments", () => {
  test("optional: a task works without any, and files can be attached from the drawer", async ({ page, team }) => {
    const task = await createTask(page.request, team.workspace.id, { title: `Spec ${uid()}`, projectId: team.project.id });
    await page.goto(`${team.url}?task=${task.id}`);
    const panel = drawer(page);
    await expect(panel.getByText("No attachments. Drop files here or attach them.")).toBeVisible();

    await panel.locator('input[type="file"]').setInputFiles([
      { name: "brief.txt", mimeType: "text/plain", buffer: Buffer.from("Launch brief v1") },
      { name: "mock.png", mimeType: "image/png", buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    ]);
    await expect(panel.getByRole("link", { name: "brief.txt" })).toBeVisible();
    await expect(panel.getByRole("link", { name: "mock.png" })).toBeVisible();
    await expect(panel.getByText("Attachments · 2")).toBeVisible();

    // Persisted, and downloadable by a workspace member.
    await page.reload();
    const link = drawer(page).getByRole("link", { name: "brief.txt" });
    await expect(link).toBeVisible();
    const download = await page.request.get((await link.getAttribute("href"))!);
    expect(download.status()).toBe(200);
    expect(await download.text()).toBe("Launch brief v1");
    expect(download.headers()["content-disposition"]).toContain("inline");
  });

  test("risky types always download instead of opening on Flow's origin", async ({ page, team }) => {
    const task = await createTask(page.request, team.workspace.id, { title: `XSS ${uid()}`, projectId: team.project.id });
    const res = await uploadVia(page, task.id, "evil.html", "text/html", "<script>alert(1)</script>");
    expect(res.status()).toBe(201);
    const { attachment } = (await res.json()) as { attachment: { url: string } };
    const download = await page.request.get(attachment.url);
    expect(download.headers()["content-type"]).toBe("application/octet-stream");
    expect(download.headers()["content-disposition"]).toMatch(/^attachment;/);
    expect(download.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("viewers can download but not upload; outsiders get nothing", async ({ page, team, browser }) => {
    const task = await createTask(page.request, team.workspace.id, { title: `Perm ${uid()}`, projectId: team.project.id });
    const { attachment } = (await (await uploadVia(page, task.id, "plan.txt", "text/plain", "plan")).json()) as {
      attachment: { url: string };
    };

    const outsider = await pageAs(browser, "member");
    expect((await outsider.request.get(attachment.url)).status()).toBe(403);

    await join(page, outsider, team, "viewer");
    expect((await outsider.request.get(attachment.url)).status()).toBe(200);
    expect((await uploadVia(outsider, task.id, "nope.txt", "text/plain", "x")).status()).toBe(403);
    await outsider.goto(`${team.url}?task=${task.id}`);
    await expect(drawer(outsider).getByRole("button", { name: "Attach files" })).toHaveCount(0);
    await outsider.context().close();
  });

  test("uploaders remove their own files; other members can't", async ({ page, team, browser }) => {
    const task = await createTask(page.request, team.workspace.id, { title: `Del ${uid()}`, projectId: team.project.id });
    const ownerFile = (await (await uploadVia(page, task.id, "owner.txt", "text/plain", "o")).json()) as {
      attachment: { id: string; url: string };
    };
    const member = await pageAs(browser, "member");
    await join(page, member, team, "member");
    expect((await member.request.delete(`/api/attachments/${ownerFile.attachment.id}`)).status()).toBe(403);

    await page.goto(`${team.url}?task=${task.id}`);
    await drawer(page).getByRole("button", { name: "Remove owner.txt" }).click();
    await expect(drawer(page).getByRole("link", { name: "owner.txt" })).toHaveCount(0);
    expect((await page.request.get(ownerFile.attachment.url)).status()).toBe(404);
    // The upload shows up in the task's activity.
    await expect(drawer(page).getByText("attached “owner.txt”")).toBeVisible();
    await member.context().close();
  });

  test("files over 25 MB are refused", async ({ page, team }) => {
    const task = await createTask(page.request, team.workspace.id, { title: `Big ${uid()}`, projectId: team.project.id });
    const res = await uploadVia(page, task.id, "huge.bin", "application/octet-stream", Buffer.alloc(25 * 1024 * 1024 + 1));
    expect(res.status()).toBe(413);
  });
});
