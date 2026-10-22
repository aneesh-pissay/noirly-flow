import { createTask, expect, openList, taskRow, test, uid } from "./fixtures";
import type { Page } from "@playwright/test";

async function addField(page: Page, name: string, type: string, options?: string) {
  await page.getByLabel("New field").fill(name);
  await page.getByLabel("Field type").selectOption({ label: type });
  if (options) await page.getByLabel("Options, separated by commas").fill(options);
  await page.getByRole("button", { name: "Add field" }).click();
  await expect(page.locator(`[data-field="${name}"]`)).toBeVisible();
}

test.describe("custom fields", () => {
  test("a project's fields are set on tasks, shown on rows and checked by the server", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const task = await createTask(page.request, ws, { title: `Pitch ${id}`, projectId: team.project.id });
    const saved = () => page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${task.id}`) && r.request().method() === "PATCH");

    await openList(page, team.url);
    await page.getByRole("button", { name: "Fields" }).click();
    const dialog = page.getByRole("dialog", { name: "Custom fields" });
    await expect(dialog.getByText("No fields yet.")).toBeVisible();
    await addField(page, "Client", "Text");
    await addField(page, "Size", "Select", "S, M, L");
    await addField(page, "Budget", "Number");
    await addField(page, "Reviewer", "Person");
    await addField(page, "Launch", "Date");
    await page.screenshot({ path: "test-results/fields-dialog.png" });
    await page.keyboard.press("Escape");

    // Set each from the drawer.
    await page.getByRole("button", { name: `Pitch ${id}` }).click();
    let save = saved();
    await page.getByLabel("Client", { exact: true }).fill("Acme");
    await page.getByLabel("Client", { exact: true }).press("Tab");
    await save;
    save = saved();
    await page.getByLabel("Size", { exact: true }).selectOption({ label: "M" });
    await save;
    save = saved();
    await page.getByLabel("Budget", { exact: true }).fill("1200");
    await page.getByLabel("Budget", { exact: true }).press("Tab");
    await save;
    save = saved();
    await page.getByLabel("Reviewer", { exact: true }).selectOption({ label: "Olive Owner" });
    await save;
    save = saved();
    await page.getByLabel("Launch", { exact: true }).fill("2030-01-15");
    await save;
    await page.keyboard.press("Escape");

    const row = taskRow(page, `Pitch ${id}`);
    await expect(row).toContainText("Client: Acme");
    await expect(row).toContainText("Size: M");
    await expect(row).toContainText(`Budget: ${new Intl.NumberFormat("en-US").format(1200)}`);
    await expect(row).toContainText("Reviewer: Olive Owner");
    await expect(row).toContainText("Launch: Jan 15, 2030");
    await page.screenshot({ path: "test-results/fields-row.png" });

    // The server checks values against the field.
    const fields = (await (await page.request.get(`/api/projects/${team.project.id}/fields`)).json()).fields as Array<{ id: string; name: string }>;
    const fieldId = (name: string) => fields.find((field) => field.name === name)!.id;
    const patch = (fieldValues: Record<string, unknown>) => page.request.patch(`/api/tasks/${task.id}`, { data: { fieldValues } });
    expect((await patch({ [fieldId("Size")]: "000000000000000000000000" })).status()).toBe(400);
    expect((await patch({ [fieldId("Reviewer")]: "000000000000000000000000" })).status()).toBe(400);
    expect((await patch({ [fieldId("Budget")]: "lots" })).status()).toBe(400);
    expect((await patch({ "000000000000000000000000": "x" })).status()).toBe(400);

    // Dropping an option or a field clears it from tasks.
    await page.getByRole("button", { name: "Fields" }).click();
    await page.getByRole("button", { name: "Remove option M" }).click();
    await expect(dialog.locator('[data-field="Size"]')).not.toContainText("M×");
    page.once("dialog", (prompt) => void prompt.accept());
    await page.getByRole("button", { name: "Delete field Client" }).click();
    await expect(dialog.locator('[data-field="Client"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(row).not.toContainText("Size:");
    await expect(row).not.toContainText("Client:");
    await expect(row).toContainText("Budget:");

    // Values belong to the project: moving the task drops them.
    const { project: other } = await (await page.request.post(`/api/workspaces/${ws}/projects`, { data: { name: `Other ${id}` } })).json();
    const moved = await (await page.request.patch(`/api/tasks/${task.id}`, { data: { projectId: other.id } })).json();
    expect(moved.task.fieldValues).toEqual({});
  });
});
