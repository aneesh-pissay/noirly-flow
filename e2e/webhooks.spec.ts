import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { verifySignature } from "@noirly-dev/webhooks";
import { createTask, expect, pageAs, test, uid, type Team } from "./fixtures";
import type { Page } from "@playwright/test";

type Received = { type: string; delivery: string; signature: string; body: string };

/** A local receiver that records what it gets and answers with `status`. */
async function receiver() {
  const received: Received[] = [];
  const state = { status: 200 };
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      received.push({
        type: String(request.headers["noirly-event"]),
        delivery: String(request.headers["noirly-delivery"]),
        signature: String(request.headers["noirly-signature"]),
        body,
      });
      response.writeHead(state.status).end(state.status === 200 ? "ok" : "nope");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/hook`, received, state, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function join(owner: Page, member: Page, team: Team) {
  const created = await owner.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role: "member" } });
  const { invite } = (await created.json()) as { invite: { token: string } };
  expect((await member.request.post("/api/invites/accept", { data: { token: invite.token } })).ok()).toBe(true);
}

test.describe("webhooks", () => {
  test("signed events reach the receiver, failures retry, and a 410 turns it off", async ({ page, team, browser }) => {
    const id = uid();
    const hook = await receiver();
    const ofType = (type: string) => hook.received.filter((item) => item.type === type);
    try {
      await page.goto(`/w/${team.workspace.id}/settings`);
      const section = page.getByRole("region", { name: "Webhooks" });
      await expect(section.getByText("No webhooks yet.")).toBeVisible();
      await section.getByLabel("Endpoint URL").fill(hook.url);
      await section.getByRole("button", { name: "Add webhook" }).click();
      const secret = await section.locator("#webhook-secret").inputValue();
      expect(secret).toMatch(/^whsec_/);

      // A task change arrives signed with that secret.
      const task = await createTask(page.request, team.workspace.id, { title: `Hooked ${id}`, projectId: team.project.id });
      await expect.poll(() => ofType("task.created").length).toBe(1);
      const created = ofType("task.created")[0]!;
      expect(verifySignature(secret, created.signature, created.body)).toBe(true);
      expect(JSON.parse(created.body)).toMatchObject({ type: "task.created", id: created.delivery, data: { id: task.id, title: `Hooked ${id}` } });

      expect((await page.request.patch(`/api/tasks/${task.id}`, { data: { status: "done" } })).ok()).toBe(true);
      await expect.poll(() => ofType("task.completed").length).toBe(1);
      expect(ofType("task.updated").length).toBe(1);

      // Send test shows up in the delivery log.
      const row = section.locator(`[data-webhook="${hook.url}"]`);
      await row.getByRole("button", { name: "Send test" }).click();
      await expect.poll(() => ofType("ping").length).toBe(1);
      const log = row.getByRole("list", { name: `Deliveries to ${hook.url}` });
      await expect(log.locator('[data-delivery="ping"]')).toContainText("200 OK");

      // A failing receiver gets retried later; Redeliver sends it now.
      hook.state.status = 500;
      await createTask(page.request, team.workspace.id, { title: `Down ${id}`, projectId: team.project.id });
      await expect.poll(() => ofType("task.created").length).toBe(2);
      await page.reload();
      await row.getByRole("button", { name: "Deliveries" }).click();
      const failing = log.locator('[data-delivery="task.created"]').first();
      await expect(failing).toContainText("Retrying");
      await expect(failing).toContainText("HTTP 500");
      await page.screenshot({ path: "test-results/webhooks.png", fullPage: true });
      hook.state.status = 200;
      await failing.getByRole("button", { name: "Redeliver" }).click();
      await expect(failing).toContainText("200 OK");
      const [first, again] = ofType("task.created").slice(1);
      expect(again?.delivery).toBe(first?.delivery);

      // Unsafe URLs are refused; members can't see webhooks.
      const add = (url: string) => page.request.post(`/api/workspaces/${team.workspace.id}/webhooks`, { data: { url, events: ["task.created"] } });
      expect((await add("https://10.0.0.1/hook")).status()).toBe(400);
      expect((await add("http://example.com/hook")).status()).toBe(400);
      const member = await pageAs(browser, "member");
      await join(page, member, team);
      expect((await member.request.get(`/api/workspaces/${team.workspace.id}/webhooks`)).status()).toBe(403);
      await member.context().close();

      // 410 Gone means stop.
      hook.state.status = 410;
      await row.getByRole("button", { name: "Send test" }).click();
      await expect(row).toContainText("Off · The receiver answered 410 Gone");
      await expect(row.getByLabel(`Webhook ${hook.url} on`)).not.toBeChecked();
    } finally {
      await hook.close();
    }
  });
});
