import { gunzipSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { createTask, expect, pageAs, test, uid, type Team } from "./fixtures";
import { E2E_CRON_SECRET } from "./env";

async function join(owner: Page, member: Page, team: Team) {
  const created = await owner.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role: "member" } });
  const { invite } = (await created.json()) as { invite: { token: string } };
  expect((await member.request.post("/api/invites/accept", { data: { token: invite.token } })).ok()).toBe(true);
}

test.describe("data export and backups", () => {
  test("exports everything as JSON for admins and tasks as CSV for everyone", async ({ page, team, browser }) => {
    const id = uid();
    const ws = team.workspace.id;
    const { tag } = await (await page.request.post(`/api/workspaces/${ws}/tags`, { data: { name: `export-${id}` } })).json();
    const task = await createTask(page.request, ws, { title: `Ship ${id}`, projectId: team.project.id });
    await page.request.patch(`/api/tasks/${task.id}`, { data: { tagIds: [tag.id] } });
    await createTask(page.request, ws, { title: `=HYPERLINK("http://evil.example") ${id}`, projectId: team.project.id });
    await page.request.post(`/api/tasks/${task.id}/comments`, { data: { body: `Looks good ${id}` } });
    await page.request.post(`/api/tasks/${task.id}/time`, { data: { minutes: 45 } });

    const json = await page.request.get(`/api/workspaces/${ws}/export?format=json`);
    expect(json.ok()).toBe(true);
    expect(json.headers()["content-disposition"]).toMatch(/attachment; filename=".+-export-\d{4}-\d{2}-\d{2}\.json"/);
    const text = await json.text();
    const data = JSON.parse(text);
    expect(data).toMatchObject({ format: "noirly-flow-export", version: 1, workspace: { id: ws } });
    expect(data.tasks.map((t: { title: string }) => t.title)).toContain(`Ship ${id}`);
    expect(data.comments.map((c: { body: string }) => c.body)).toContain(`Looks good ${id}`);
    expect(data.timeEntries.some((e: { taskId: string; minutes: number }) => e.taskId === task.id && e.minutes === 45)).toBe(true);
    expect(data.projects.find((p: { id: string }) => p.id === team.project.id).columns.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/tokenHash|"secret"/);

    const csv = await page.request.get(`/api/workspaces/${ws}/export?format=csv`);
    const sheet = await csv.text();
    expect(sheet.startsWith("﻿ID,Title,Project")).toBe(true);
    expect(sheet).toContain(`Ship ${id},${team.project.name}`);
    expect(sheet).toContain(`export-${id}`);
    expect(sheet).toContain(`"'=HYPERLINK(""http://evil.example"") ${id}"`);

    const member = await pageAs(browser, "member");
    await join(page, member, team);
    expect((await member.request.get(`/api/workspaces/${ws}/export?format=json`)).status()).toBe(403);
    expect((await member.request.get(`/api/workspaces/${ws}/export?format=csv`)).ok()).toBe(true);
    expect((await member.request.get(`/api/workspaces/${ws}/backups`)).status()).toBe(403);
    await member.context().close();
  });

  test("backs up now and on a schedule, keeps the files private, and downloads them", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    await createTask(page.request, ws, { title: `Backed up ${id}`, projectId: team.project.id });

    await page.goto(`/w/${ws}/settings#data`);
    const section = page.getByRole("region", { name: "Export" });
    await expect(section.getByRole("link", { name: "Everything (JSON)" })).toBeVisible();
    await section.getByRole("button", { name: "Back up now" }).click();
    const list = section.getByRole("list", { name: "Backups" });
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(list).toContainText("By hand · 1 task ·");
    expect((await page.request.post(`/api/workspaces/${ws}/backups/run`)).status()).toBe(429);

    await section.getByRole("checkbox", { name: "Back up automatically" }).check();
    await section.getByLabel("How often").selectOption("daily");
    await page.screenshot({ path: "test-results/data-section.png", fullPage: true });
    await page.reload();
    await expect(section.getByRole("checkbox", { name: "Back up automatically" })).toBeChecked();
    await expect(section.getByLabel("How often")).toHaveValue("daily");

    // The file is the gzipped export.
    const href = await list.getByRole("link", { name: /Download backup/ }).getAttribute("href");
    const file = await page.request.get(href!);
    expect(file.headers()["content-type"]).toBe("application/gzip");
    const restored = JSON.parse(gunzipSync(await file.body()).toString("utf8"));
    expect(restored.tasks.map((t: { title: string }) => t.title)).toContain(`Backed up ${id}`);

    // The cron backs up workspaces that are due: a new one with a schedule and no backup yet.
    const { workspace: other } = await (await page.request.post("/api/workspaces", { data: { name: `Scheduled ${id}` } })).json();
    expect((await page.request.put(`/api/workspaces/${other.id}/backups`, { data: { enabled: true, frequency: "weekly" } })).ok()).toBe(true);
    const cron = await page.request.get("/api/cron/backups", { headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` } });
    expect(cron.ok()).toBe(true);
    const after = await (await page.request.get(`/api/workspaces/${other.id}/backups`)).json();
    expect(after.backups).toHaveLength(1);
    expect(after.backups[0]).toMatchObject({ trigger: "scheduled", taskCount: 0 });
    expect((await page.request.get("/api/cron/backups")).status()).toBe(401);
  });
});
