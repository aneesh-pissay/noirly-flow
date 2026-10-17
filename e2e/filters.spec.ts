import { createTask, expect, pageAs, test, uid } from "./fixtures";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test.describe("saved filters", () => {
  test("a query is checked as you type, saved, edited, private and deletable", async ({ page, team, browser }) => {
    const id = uid();
    const ws = team.workspace.id;
    await createTask(page.request, ws, { title: `Hot ${id}`, projectId: team.project.id, dueAt: today(), priority: "high" });
    await createTask(page.request, ws, { title: `Cold ${id}`, projectId: team.project.id, dueAt: today() });
    await createTask(page.request, ws, { title: `Someday ${id}`, projectId: null });

    await page.goto(`/w/${ws}/filters`);
    await page.getByLabel("Name").fill(`Urgent ${id}`);
    const query = page.getByLabel("Query");
    const save = page.getByRole("button", { name: "Save filter" });

    await query.fill("today &");
    await expect(page.locator("#filter-query-help")).toHaveText("The query ends too early");
    await expect(save).toBeDisabled();
    await query.fill("today & @nosuchtag");
    await expect(page.locator("#filter-query-help")).toHaveText("No tag called “nosuchtag”");

    await query.fill(`today & p1 & #${team.project.name}`);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page).toHaveURL(new RegExp(`/w/${ws}/filters/[a-f0-9]{24}$`));
    const filterId = page.url().split("/").at(-1)!;
    await expect(page.getByRole("heading", { level: 1, name: `Urgent ${id}` })).toBeVisible();
    await expect(page.getByText(`Hot ${id}`)).toBeVisible();
    await expect(page.getByText(`Cold ${id}`)).toHaveCount(0);
    await expect(page.getByRole("link", { name: `Urgent ${id}` })).toBeVisible();

    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Query").fill("no date & #inbox");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(`Someday ${id}`)).toBeVisible();
    await expect(page.getByText(`Hot ${id}`)).toHaveCount(0);

    // Filters are personal: someone else can't read or change this one.
    const other = await pageAs(browser, "member");
    expect((await other.request.patch(`/api/filters/${filterId}`, { data: { name: "Mine now" } })).status()).toBe(404);
    expect((await other.request.delete(`/api/filters/${filterId}`)).status()).toBe(404);
    await other.context().close();

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${ws}/filters$`));
    await expect(page.getByRole("link", { name: `Urgent ${id}` })).toHaveCount(0);
  });
});
