import type { Page } from "@playwright/test";
import { expect, pageAs, test, uid, type Team } from "./fixtures";

async function join(owner: Page, member: Page, team: Team, role: "member" | "viewer") {
  const created = await owner.request.post(`/api/workspaces/${team.workspace.id}/invites`, { data: { role } });
  const { invite } = (await created.json()) as { invite: { token: string } };
  expect((await member.request.post("/api/invites/accept", { data: { token: invite.token } })).ok()).toBe(true);
}

type ApiTask = { id: string; title: string; priority: string; status: string; parentTaskId: string | null; sectionId: string | null; tagIds: string[]; dueAt: string | null; recurrence: { frequency: string } | null };

test.describe("import", () => {
  test("a Todoist export and a plain CSV come in with their structure", async ({ page, team, browser }) => {
    const id = uid();
    const ws = team.workspace.id;
    const todoist = [
      "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE",
      `section,Plan ${id},,,,,,,,`,
      `task,Write brief ${id} @imported-${id},Two pages,1,1,Sam,,tomorrow,en,`,
      "note,Ask Priya first,,,,,,,,",
      `task,Collect quotes ${id},,4,2,Sam,,every monday,en,`,
      `task,Book venue ${id},,2,1,Sam,,,en,`,
      `section,Later ${id},,,,,,,,`,
      `task,Retro ${id},,,1,,,,en,`,
    ].join("\n");

    await page.goto(`/w/${ws}/settings#data`);
    await page.getByLabel("Import into project").selectOption({ label: team.project.name });
    await page.getByLabel("CSV file to import").setInputFiles({ name: "todoist.csv", mimeType: "text/csv", buffer: Buffer.from(todoist) });
    await expect(page.getByText("Todoist export")).toBeVisible();
    await expect(page.getByText("4 tasks, 1 of them subtasks · 2 sections · 1 note as comments")).toBeVisible();
    await page.getByRole("region", { name: "Export" }).screenshot({ path: "test-results/import-preview.png" });
    await page.getByRole("button", { name: "Import 4 tasks" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 4 tasks, 2 new sections, 1 new tag." })).toBeVisible();

    const tasks = async () => (await (await page.request.get(`/api/workspaces/${ws}/tasks?projectId=${team.project.id}`)).json()).tasks as ApiTask[];
    const byTitle = (list: ApiTask[], title: string) => list.find((t) => t.title === title)!;
    let list = await tasks();
    const brief = byTitle(list, `Write brief ${id}`);
    const quotes = byTitle(list, `Collect quotes ${id}`);
    expect(brief).toMatchObject({ priority: "high" });
    expect(brief.tagIds).toHaveLength(1);
    expect(brief.dueAt).not.toBeNull();
    expect(quotes).toMatchObject({ parentTaskId: brief.id, recurrence: { frequency: "weekly" } });
    const sections = (await (await page.request.get(`/api/projects/${team.project.id}/sections`)).json()).sections as Array<{ id: string; name: string }>;
    expect(sections.find((s) => s.id === byTitle(list, `Retro ${id}`).sectionId)?.name).toBe(`Later ${id}`);
    const comments = (await (await page.request.get(`/api/tasks/${brief.id}/comments`)).json()).comments as Array<{ body: string }>;
    expect(comments.map((c) => c.body)).toEqual(["Ask Priya first"]);

    // Any CSV: columns are guessed and can be changed.
    const csv = `Name,When,Importance,State\nPay rent ${id},2026-11-03,High,Done\n,2026-11-04,,\nCall bank ${id},next friday,low,open\n`;
    await page.getByLabel("CSV file to import").setInputFiles({ name: "plain.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByText("plain.csv")).toBeVisible();
    await page.getByLabel("Column for Due date").selectOption({ label: "When" });
    await page.getByLabel("Column for Priority").selectOption({ label: "Importance" });
    await page.getByLabel("Column for Status").selectOption({ label: "State" });
    await expect(page.getByText("1 row without a title was skipped.")).toBeVisible();
    await page.getByRole("button", { name: "Import 2 tasks" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported 2 tasks" })).toBeVisible();
    list = await tasks();
    expect(byTitle(list, `Pay rent ${id}`)).toMatchObject({ priority: "high", status: "done" });
    expect(new Date(byTitle(list, `Pay rent ${id}`).dueAt!).getDate()).toBe(3);
    expect(byTitle(list, `Call bank ${id}`)).toMatchObject({ priority: "low", status: "todo" });

    // Viewers can't import; plans are checked.
    const viewer = await pageAs(browser, "member");
    await join(page, viewer, team, "viewer");
    const one = { title: "x", description: null, priority: "none", dueAt: null, dueHasTime: false, recurrence: null, done: false, tagNames: [], sectionName: null, assigneeEmail: null, parent: null, comments: [] };
    expect((await viewer.request.post(`/api/projects/${team.project.id}/import`, { data: { tasks: [one] } })).status()).toBe(403);
    expect((await page.request.post(`/api/projects/${team.project.id}/import`, { data: { tasks: [{ ...one, parent: 0 }] } })).status()).toBe(400);
    await viewer.context().close();
  });
});
