import { expect, openList, test, uid } from "./fixtures";

test.describe("intake forms", () => {
  test("a form built in the project takes responses from anyone and turns them into tasks", async ({ page, team, browser }) => {
    // Many steps, two browsers and a dozen submissions: more than the default 30 s under load.
    test.setTimeout(60_000);
    const id = uid();
    await openList(page, team.url);
    await page.getByRole("button", { name: "Forms" }).click();
    const dialog = page.getByRole("dialog", { name: "Intake forms" });
    await expect(dialog.getByText("No forms yet.")).toBeVisible();
    await dialog.getByRole("button", { name: "New form" }).click();
    await dialog.getByLabel("Form name").fill(`Bug report ${id}`);
    await dialog.getByLabel("Question that becomes the task title").fill("What broke?");
    await dialog.getByRole("button", { name: "+ Add question" }).click();
    await dialog.getByLabel("Question 1", { exact: true }).fill("Your email");
    await dialog.getByLabel("Question 1 type").selectOption({ label: "Email" });
    await dialog.getByRole("checkbox", { name: "Required" }).check();
    await dialog.getByRole("button", { name: "+ Add question" }).click();
    await dialog.getByLabel("Question 2", { exact: true }).fill("Area");
    await dialog.getByLabel("Question 2 type").selectOption({ label: "Choice" });
    await dialog.getByLabel("Question 2 choices").fill("Billing, Login");
    await dialog.getByLabel("Priority").selectOption({ label: "High" });
    await dialog.getByLabel("Message after sending (optional)").fill("Thanks, we'll look today.");
    await page.screenshot({ path: "test-results/form-builder.png" });
    await dialog.getByRole("button", { name: "Save form" }).click();
    const row = dialog.locator(`[data-form="Bug report ${id}"]`);
    await expect(row).toContainText("No responses yet");
    const link = await row.getByLabel(`Link to Bug report ${id}`).inputValue();
    expect(link).toMatch(/\/f\/[\w-]{20,}$/);

    // Someone without an account fills it in.
    const visitor = await browser.newContext();
    const guest = await visitor.newPage();
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: `Bug report ${id}` })).toBeVisible();
    await guest.getByRole("button", { name: "Send" }).click();
    await expect(guest.getByText("What broke? is required")).toBeVisible();
    await expect(guest.getByText("Your email is required")).toBeVisible();
    await guest.getByLabel("What broke?").fill(`Checkout spins ${id}`);
    await guest.getByLabel("Details").fill("Since this morning");
    await guest.getByLabel("Your email").fill("pat@example.com");
    await guest.getByLabel("Area").selectOption("Billing");
    await expect(guest.getByText("What broke? is required")).toHaveCount(0);
    await guest.screenshot({ path: "test-results/form-public.png", fullPage: true });
    await guest.getByRole("button", { name: "Send" }).click();
    await expect(guest.getByRole("heading", { name: "Thanks, it's in" })).toBeVisible();
    await expect(guest.getByText("Thanks, we'll look today.")).toBeVisible();

    // It's a task in the project.
    const tasks = async () => (await (await page.request.get(`/api/workspaces/${team.workspace.id}/tasks?projectId=${team.project.id}`)).json()).tasks as Array<{ title: string; priority: string; description: string }>;
    const made = (await tasks()).find((task) => task.title === `Checkout spins ${id}`);
    expect(made).toMatchObject({ priority: "high" });
    expect(made!.description).toBe(`Since this morning\n\nYour email: pat@example.com\n\nArea: Billing\n\nSubmitted through the “Bug report ${id}” form.`);

    // A bot filling the hidden field is told it worked, but nothing is made.
    const publicId = link.split("/f/")[1]!;
    const post = (data: object) => visitor.request.post(`${new URL(link).origin}/api/forms/public/${publicId}`, { data, headers: { "X-Noirly-CSRF": "1" } });
    expect((await post({ title: `Bot ${id}`, website: "http://spam.example" })).status()).toBe(201);
    expect((await tasks()).some((task) => task.title === `Bot ${id}`)).toBe(false);

    // The server checks answers too, and limits each address to 10 tries an hour per form.
    const form = (await (await page.request.get(`/api/projects/${team.project.id}/forms`)).json()).forms[0];
    const emailId = form.questions.find((q: { label: string }) => q.label === "Your email").id;
    const bad = await post({ title: "No email" });
    expect(bad.status()).toBe(422);
    expect((await bad.json()).errors).toEqual({ [emailId]: "Your email is required" });
    // Three tries used so far (the empty and the real one on the page, and the bad one), so seven more get in.
    const statuses: number[] = [];
    for (let i = 0; i < 9; i += 1) statuses.push((await post({ title: `Flood ${i} ${id}`, answers: { [emailId]: "a@b.co" } })).status());
    expect(statuses).toEqual([201, 201, 201, 201, 201, 201, 201, 429, 429]);

    // Closing the form takes the link down.
    await page.reload();
    await page.getByRole("button", { name: "Forms" }).click();
    await expect(row).toContainText("responses");
    // The switch moves at once; wait for the save before trying the link.
    const closed = page.waitForResponse((r) => r.url().endsWith(`/api/forms/${form.id}`) && r.request().method() === "PATCH");
    await row.getByLabel(`Bug report ${id} taking responses`).uncheck();
    await expect(row).toHaveClass(/opacity-60/);
    expect((await closed).ok()).toBe(true);
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: "Not found" })).toBeVisible();
    await visitor.close();
  });
});
