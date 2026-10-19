import { createTask, expect, openList, test, uid } from "./fixtures";

test.describe("goals", () => {
  test("goals and milestones roll up the tasks linked to them", async ({ page, team }) => {
    const id = uid();
    const ws = team.workspace.id;
    const existing = await createTask(page.request, ws, { title: `Existing ${id}`, projectId: team.project.id });

    // Create a goal from the list.
    await page.goto(`/w/${ws}/goals`);
    await page.getByLabel("New goal").fill(`Launch ${id}`);
    await page.getByLabel("Target date").fill("2030-06-30");
    await page.getByRole("button", { name: "Add goal" }).click();
    const card = page.getByRole("list", { name: "Goals" }).getByRole("listitem").filter({ hasText: `Launch ${id}` });
    await expect(card).toContainText("No tasks yet");
    await expect(card).toContainText("Target Jun 30, 2030");

    // Milestone and tasks on the goal page.
    await card.getByRole("link", { name: `Launch ${id}` }).click();
    await expect(page.getByRole("heading", { name: `Launch ${id}` })).toBeVisible();
    await page.getByLabel("New milestone").fill(`Alpha ${id}`);
    await page.getByRole("button", { name: "Add milestone" }).click();
    const alpha = page.locator(`[data-milestone="Alpha ${id}"]`);
    await expect(alpha).toContainText("No tasks yet");

    await page.getByLabel("Add a task to this goal").fill(`Write spec ${id}`);
    await page.getByLabel("Milestone", { exact: true }).selectOption({ label: `Alpha ${id}` });
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByRole("group", { name: new RegExp(`Alpha ${id}`) })).toContainText(`Write spec ${id}`);
    await page.getByLabel("Add a task to this goal").fill(`Polish ${id}`);
    await page.getByLabel("Milestone", { exact: true }).selectOption({ label: "No milestone" });
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByRole("group", { name: /No milestone/ })).toContainText(`Polish ${id}`);
    await expect(alpha).toContainText("0 of 1 tasks · 0%");

    // Finishing a task moves the milestone and the goal.
    await page.getByRole("button", { name: `Complete Write spec ${id}` }).click();
    await expect(alpha).toContainText("1 of 1 tasks · 100%");
    await expect(alpha).toContainText("Done");
    await expect(page.getByRole("progressbar", { name: "Goal progress" })).toHaveAttribute("aria-valuenow", "50");
    await page.screenshot({ path: "test-results/goal-detail.png", fullPage: true });

    // A task elsewhere links up from its drawer.
    await openList(page, team.url);
    await page.getByRole("button", { name: `Existing ${id}` }).click();
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${existing.id}`) && r.request().method() === "PATCH");
    await page.getByLabel("Goal", { exact: true }).selectOption({ label: `Launch ${id}` });
    await saved;
    const savedMilestone = page.waitForResponse((r) => r.url().endsWith(`/api/tasks/${existing.id}`) && r.request().method() === "PATCH");
    await page.getByLabel("Milestone", { exact: true }).selectOption({ label: `Alpha ${id}` });
    await savedMilestone;
    await page.keyboard.press("Escape");

    await page.goto(`/w/${ws}/goals`);
    await expect(card).toContainText("1 of 3 tasks · 33%");
    await page.screenshot({ path: "test-results/goals-list.png", fullPage: true });

    // Links are checked: a milestone must be on the task's goal.
    const goals = (await (await page.request.get(`/api/workspaces/${ws}/goals`)).json()).goals as Array<{ id: string; milestones: Array<{ id: string }> }>;
    const launch = goals[0]!;
    const other = (await (await page.request.post(`/api/workspaces/${ws}/goals`, { data: { name: `Other ${id}` } })).json()).goal;
    expect((await page.request.patch(`/api/tasks/${existing.id}`, { data: { goalId: other.id, milestoneId: launch.milestones[0]!.id } })).status()).toBe(403);

    // Removing the milestone keeps its tasks on the goal; archiving hides the goal.
    await page.goto(`/w/${ws}/goals/${launch.id}`);
    await page.getByRole("button", { name: `Remove milestone Alpha ${id}` }).click();
    await expect(page.getByRole("group", { name: /No milestone/ })).toContainText(`Existing ${id}`);
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "← Goals" }).click();
    await expect(card).toHaveCount(0);
    await page.getByRole("button", { name: "Show archived (1)" }).click();
    await expect(page.getByRole("list", { name: "Archived goals" })).toContainText(`Launch ${id}`);
  });
});
