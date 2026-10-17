import { createTask, expect, openList, taskRow, test, uid } from "./fixtures";

test.describe("tags", () => {
  test("added in the drawer and by @quick add, filtered in the list, managed in settings", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const task = await createTask(page.request, ws, { title: `Tagged ${id}`, projectId: team.project.id });
    await createTask(page.request, ws, { title: `Plain ${id}`, projectId: team.project.id });

    // A new tag from the drawer is created and put on the task.
    const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "GET");
    await page.goto(`${team.url}?task=${task.id}`);
    await loaded;
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "PATCH");
    await page.getByLabel("New tag").fill(`errand${id}`);
    await page.getByLabel("New tag").press("Enter");
    await saved;
    await expect(page.getByRole("group", { name: "Tags" }).getByRole("button", { name: `errand${id}` })).toHaveAttribute("aria-pressed", "true");

    // Quick add makes a tag from @name.
    await page.keyboard.press("Escape");
    await openList(page, team.url);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Create task" });
    await expect(dialog.getByText("Not created yet")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Title" }).fill(`Pay bill ${id} @errand${id} @fresh${id}`);
    await expect(dialog.locator("#quick-add-preview")).toContainText(`@fresh${id} (new)`);
    await dialog.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(dialog).toBeHidden();
    await page.keyboard.press("Escape");

    await openList(page, team.url);
    await expect(taskRow(page, `Tagged ${id}`)).toContainText(`@errand${id}`);
    await expect(taskRow(page, `Pay bill ${id}`)).toContainText(`@fresh${id}`);

    // The list filter keeps only tasks with the tag.
    await page.getByLabel("Tag").selectOption({ label: `@errand${id}` });
    await expect(taskRow(page, `Tagged ${id}`)).toBeVisible();
    await expect(taskRow(page, `Pay bill ${id}`)).toBeVisible();
    await expect(page.getByText(`Plain ${id}`)).toHaveCount(0);

    // Settings: rename, recolour, delete.
    await page.goto(`/w/${ws}/settings`);
    const name = page.getByLabel(`Name of tag errand${id}`);
    await name.fill(`chore${id}`);
    await name.press("Enter");
    await expect(page.getByLabel(`Name of tag chore${id}`)).toBeVisible();
    await page.getByRole("radiogroup", { name: `Colour of tag chore${id}` }).getByRole("radio", { name: "Green" }).click();
    await expect(page.getByRole("radiogroup", { name: `Colour of tag chore${id}` }).getByRole("radio", { name: "Green" })).toHaveAttribute("aria-checked", "true");
    const { tags } = await (await page.request.get(`/api/workspaces/${ws}/tags`)).json();
    const chore = (tags as Array<{ id: string; name: string; color: string }>).find((t) => t.name === `chore${id}`)!;
    expect(chore.color).toBe("#4ADE80");

    page.once("dialog", (d) => void d.accept());
    await page.getByLabel(`Name of tag chore${id}`).locator("xpath=..").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByLabel(`Name of tag chore${id}`)).toHaveCount(0);
    const after = (await (await page.request.get(`/api/tasks/${task.id}`)).json()).task;
    expect(after.tagIds).not.toContain(chore.id);
  });
});
