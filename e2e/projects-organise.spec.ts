import { createTask, expect, pageAs, test, uid } from "./fixtures";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test.describe("project colours, favourites and archive", () => {
  test("colour and favourite from the sidebar; archive hides a project and its tasks", async ({ page, team, browser }) => {
    const id = uid();
    const ws = team.workspace.id;
    const { project } = await (await page.request.post(`/api/workspaces/${ws}/projects`, { data: { name: `Launch ${id}` } })).json();
    await createTask(page.request, ws, { title: `Ship it ${id}`, projectId: project.id, dueAt: today() });

    await page.goto(team.url);
    const sidebar = page.locator("aside");

    // Favourite: shown under Favourites, for this person only.
    await sidebar.getByRole("button", { name: `Add Launch ${id} to favourites` }).click();
    await expect(sidebar.getByRole("list", { name: "Favourite projects" })).toContainText(`Launch ${id}`);
    const other = await pageAs(browser, "member");
    expect((await (await other.request.get("/api/me/favorite-projects")).json()).projectIds).not.toContain(project.id);
    await other.context().close();

    // Colour from the edit form.
    await sidebar.getByRole("button", { name: `Edit Launch ${id}` }).click();
    await sidebar.getByRole("radiogroup", { name: "Project colour" }).getByRole("radio", { name: "Violet" }).click();
    await expect.poll(async () => (await (await page.request.get(`/api/projects/${project.id}`)).json()).project.color).toBe("#A78BFA");

    // Archive: out of the sidebar, Favourites and Today; its page says so.
    await sidebar.getByRole("button", { name: "Archive" }).click();
    await expect(sidebar.getByRole("link", { name: `Launch ${id}` })).toHaveCount(0);
    await page.goto(`/w/${ws}/today`);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByText(`Ship it ${id}`)).toHaveCount(0);

    await sidebar.getByRole("button", { name: /^Archived \(\d+\)$/ }).click();
    await sidebar.getByRole("list", { name: "Archived projects" }).getByRole("link", { name: `Launch ${id}` }).click();
    await expect(page.getByRole("status").filter({ hasText: "This project is archived" })).toBeVisible();

    // Unarchive brings it, and its tasks, back.
    await page.getByRole("status").filter({ hasText: "This project is archived" }).getByRole("button", { name: "Unarchive" }).click();
    await expect(page.getByRole("status").filter({ hasText: "This project is archived" })).toHaveCount(0);
    await page.goto(`/w/${ws}/today`);
    await expect(page.getByText(`Ship it ${id}`)).toBeVisible();
  });
});
