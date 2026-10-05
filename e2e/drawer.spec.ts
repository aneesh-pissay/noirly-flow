import { createTask, expect, openList, taskRow, test, uid } from "./fixtures";
import type { Page } from "@playwright/test";

function drawer(page: Page) {
  return page.locator("aside", { has: page.getByPlaceholder("Add a description…") });
}

/** Submits one of the drawer's inline "Add" forms by its placeholder. */
async function addVia(page: Page, placeholder: string, value: string) {
  const input = drawer(page).getByPlaceholder(placeholder);
  await input.fill(value);
  await input.press("Enter");
}

test.describe("task drawer", () => {
  test("opens from the list with ?task= and closes with Escape", async ({ page, team }) => {
    const title = `Drawer ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await openList(page, team.url);

    await taskRow(page, title).getByRole("button", { name: title }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]task=${task.id}`));
    await expect(drawer(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(drawer(page)).toBeHidden();
    await expect(page).not.toHaveURL(/[?&]task=/);
  });

  test("a ?task= deep link opens the drawer", async ({ page, team }) => {
    const title = `Deep ${uid()}`;
    const task = await createTask(page.request, team.workspace.id, { title, projectId: team.project.id });
    await page.goto(`${team.url}?task=${task.id}`);
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).locator("input").first()).toHaveValue(title);
  });

  test("title, description, checklist, subtask and comment all persist", async ({ page, team }) => {
    const id = uid();
    const task = await createTask(page.request, team.workspace.id, { title: `Old title ${id}`, projectId: team.project.id });
    // The drawer copies the task into its fields when the fetch lands, wiping
    // anything typed before then (known UX gap) — wait for it, as a person would.
    const loaded = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "GET");
    await page.goto(`${team.url}?task=${task.id}`);
    await loaded;
    const panel = drawer(page);
    await expect(panel).toBeVisible();

    const titleInput = panel.locator("input").first();
    await titleInput.fill(`New title ${id}`);
    await titleInput.blur();

    const description = panel.getByPlaceholder("Add a description…");
    await description.fill("Ship it behind a flag.");
    await description.blur();

    await addVia(page, "Add checklist item", "Write tests");
    await expect(panel.getByText("Write tests")).toBeVisible();

    await addVia(page, "Add subtask", `Sub ${id}`);
    await expect(panel.getByText(`Sub ${id}`)).toBeVisible();

    await panel.getByPlaceholder("Write a comment…").fill("Looks good to me");
    await panel.getByRole("button", { name: "Comment" }).click();
    await expect(panel.getByText("Looks good to me")).toBeVisible();

    // Everything reloads from the server.
    await expect
      .poll(async () => (await (await page.request.get(`/api/tasks/${task.id}`)).json()).task?.title)
      .toBe(`New title ${id}`);
    await page.reload();
    await expect(drawer(page)).toBeVisible();
    await expect(drawer(page).locator("input").first()).toHaveValue(`New title ${id}`);
    await expect(drawer(page).getByPlaceholder("Add a description…")).toHaveValue("Ship it behind a flag.");
    await expect(drawer(page).getByText("Write tests")).toBeVisible();
    await expect(drawer(page).getByText(`Sub ${id}`)).toBeVisible();
    await expect(drawer(page).getByText("Looks good to me")).toBeVisible();
  });
});
