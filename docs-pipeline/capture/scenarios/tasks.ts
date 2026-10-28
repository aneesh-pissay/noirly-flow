import { expect } from "@playwright/test";
import { E2E_CRON_SECRET } from "../../../e2e/env";
import { drawer, openList, openTask, row, scenario, type Scenario } from "../scenario";

/** The next Monday on or after today, date-only. */
function nextMonday() {
  const date = new Date();
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const taskScenarios: Record<string, Scenario> = {
  "creating-tasks": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await rec.click(page.getByRole("button", { name: "New task", exact: true }), "Choose New task.");
      const dialog = page.getByRole("dialog", { name: "Create task" });
      await expect(dialog.getByText("Not created yet")).toBeVisible();
      rec.say("Only the title is required. Create task stays off until there is one.");
      await rec.pause(1200);
      await rec.shot("dialog", "The Create task dialog");
      await rec.type(dialog.getByRole("textbox", { name: "Title" }), "Book the user interviews", "Type a title…");
      await rec.shot("filled", "A title typed into the dialog");
      await rec.click(dialog.getByRole("button", { name: "Create task", exact: true }), "…and create it.");
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("button", { name: "Close task" })).toBeVisible();
      rec.say("The new task is in the list and open in the drawer, ready for more detail.");
      await rec.pause(1600);
      await rec.shot("created", "The new task open in the drawer");
    },
  }),

  "quick-add": scenario({
    setup: (api) => api.sampleTeam("Northwind Studio", "Launch"),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await rec.click(page.getByRole("button", { name: "New task", exact: true }), "Open New task and just type a sentence.");
      const dialog = page.getByRole("dialog", { name: "Create task" });
      await expect(dialog.getByText("Not created yet")).toBeVisible();
      await rec.type(dialog.getByRole("textbox", { name: "Title" }), "Pay the hosting invoice every 1st 9am p1 #Launch @billing");
      await rec.shot("typed", "A quick-add sentence in the title");
      const preview = dialog.locator("#quick-add-preview");
      await expect(preview).toContainText("P1");
      await expect(preview).toContainText("#Launch");
      await expect(preview).toContainText("Every month on day 1");
      await rec.point(preview, "The preview shows what Flow understood: a monthly repeat at 9:00, P1, the project and a new tag.");
      await rec.pause(800);
      await rec.shot("preview", "The quick-add preview of recognised details");
      await rec.click(dialog.getByRole("button", { name: "Create task", exact: true }), "Create it — the saved title is just “Pay the hosting invoice”.");
      await expect(dialog).toBeHidden();
      await expect(drawer(page).getByRole("textbox", { name: "Task title" })).toHaveValue("Pay the hosting invoice");
      await rec.pause(1500);
    },
  }),

  "task-drawer": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await rec.click(page.getByRole("button", { name: "Draft the sitemap", exact: true }), "Click a task to open the drawer.");
      await expect(drawer(page).getByRole("textbox", { name: "Task title" })).toHaveValue("Draft the sitemap");
      await expect(page).toHaveURL(/[?&]task=/);
      await rec.shot("open", "The task drawer open beside the list");
      await rec.fill(drawer(page).getByPlaceholder("Add a description…"), "Cover the main pages, the blog and the help centre.", "Edit any field — it saves as you go.");
      await drawer(page).getByPlaceholder("Add a description…").blur();
      await rec.shot("edit", "Editing a task's description in the drawer");
      await rec.type(drawer(page).getByPlaceholder("Write a comment…"), "First draft is up — feedback welcome.", "Comments live on the task too.");
      await rec.click(drawer(page).getByRole("button", { name: "Comment", exact: true }));
      await expect(drawer(page).locator("p", { hasText: "First draft is up" })).toBeVisible();
      await rec.shot("comment", "A comment posted on the task");
      await rec.press("Escape", "Escape closes the drawer.");
      await expect(drawer(page)).toBeHidden();
    },
  }),

  "dates-and-durations": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await openTask(page, "Collect moodboard references");
      rec.say("Give the due date a time…");
      const time = drawer(page).getByLabel("Due time (optional)");
      await rec.type(time, "15:30");
      await time.press("Enter");
      await rec.pause(800);
      await rec.shot("due", "Due date with a due time");
      await rec.select(drawer(page).getByLabel("Duration"), "90", "…and an estimate. It powers the timeline and capacity.");
      await rec.shot("duration", "A 1h 30m duration estimate");
      await rec.press("Escape");
      await expect(row(page, "Collect moodboard references")).toContainText("3:30");
      await expect(row(page, "Collect moodboard references")).toContainText(/1h 30m/i);
      await rec.point(row(page, "Collect moodboard references"), "The row shows the time and the estimate.");
      await rec.shot("row", "The task row showing its time and duration");
    },
  }),

  recurrence: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      await api.task(sample.ws, { title: "Client check-in", projectId: sample.pid, dueAt: nextMonday() });
      return sample;
    },
    run: async ({ page, rec, data, api }) => {
      await openList(page, data.team.url);
      await openTask(page, "Client check-in");
      await rec.select(drawer(page).getByLabel("Repeat", { exact: true }), "custom", "Under Repeat, choose a preset or Custom…");
      await rec.shot("custom", "The custom repeat editor");
      await rec.click(drawer(page).getByRole("button", { name: /^Thu/ }), "…pick the weekdays…");
      const every = drawer(page).getByLabel("Repeat every");
      await rec.type(every, "2", "…and how often.");
      await every.press("Enter");
      await expect(drawer(page).getByText(/Every 2 weeks on Mon, Thu/)).toBeVisible();
      await rec.point(drawer(page).getByText(/Every 2 weeks on Mon, Thu/), "Flow reads the rule back: every 2 weeks on Monday and Thursday.");
      await rec.shot("rule", "A custom repeat rule read back in words");
      await rec.press("Escape");
      await rec.select(row(page, "Client check-in").locator("select").first(), "done", "Complete it, and the next occurrence appears.");
      await expect.poll(async () => {
        const { tasks } = await (await api.get(`/api/workspaces/${data.ws}/tasks?projectId=${data.pid}`)).json();
        return (tasks as Array<{ title: string; status: string }>).filter((t) => t.title === "Client check-in" && t.status !== "done").length;
      }).toBe(1);
      await openList(page, data.team.url);
      await rec.point(row(page, "Client check-in").first(), "Here it is, due Thursday.");
    },
  }),

  reminders: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      const soon = await api.task(sample.ws, { title: "Call the printer", projectId: sample.pid });
      await api.patch(`/api/tasks/${soon.id}`, { dueAt: new Date(Date.now() + 10 * 60_000).toISOString(), dueHasTime: true, reminderMinutes: 15 });
      return sample;
    },
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await openTask(page, "Draft the sitemap");
      await rec.point(drawer(page).getByLabel("Reminder"), "Reminders need a due time.");
      await expect(drawer(page).getByText("Add a due time to set a reminder.")).toBeVisible();
      await rec.shot("disabled", "Reminder waits for a due time");
      const time = drawer(page).getByLabel("Due time (optional)");
      await rec.type(time, "09:30", "Add one…");
      await time.press("Enter");
      await expect(drawer(page).getByLabel("Reminder")).toBeEnabled();
      await rec.select(drawer(page).getByLabel("Reminder"), "15", "…then choose when to be reminded.");
      await rec.shot("set", "A reminder 15 minutes before");
      await rec.press("Escape");
      rec.note("The reminder sweep was run through the scheduler route instead of waiting for the clock.");
      await page.request.get("/api/cron/due-reminders", { headers: { Authorization: `Bearer ${E2E_CRON_SECRET}` } });
      await page.reload();
      const bell = page.getByRole("button", { name: /^Notifications, \d+ unread$/ });
      await expect(bell).toBeVisible();
      await rec.click(bell, "When it's due, the reminder lands in the bell (and by email).");
      await expect(page.getByRole("dialog", { name: "Notifications" })).toContainText("Call the printer");
      await rec.pause(1500);
    },
  }),

  subtasks: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await openTask(page, "Design the homepage");
      const add = drawer(page).getByPlaceholder("Add subtask");
      await rec.type(add, "Hero section", "Break a task down: type a subtask and press Enter.");
      await add.press("Enter");
      await expect(drawer(page).getByRole("button", { name: "Hero section" })).toBeVisible();
      await rec.type(add, "Navigation");
      await add.press("Enter");
      await expect(drawer(page).getByRole("button", { name: "Navigation" })).toBeVisible();
      await rec.shot("added", "Two subtasks under a task");
      await rec.click(drawer(page).getByRole("button", { name: "Hero section" }), "Each subtask is a full task — open it…");
      await expect(drawer(page).getByRole("navigation", { name: "Parent tasks" })).toContainText("Design the homepage");
      await rec.point(drawer(page).getByRole("navigation", { name: "Parent tasks" }), "…and the breadcrumb leads back up.");
      await rec.shot("child", "A subtask with its breadcrumb");
      await rec.press("Escape");
      await expect(row(page, "Design the homepage")).toContainText("0/2");
      await rec.point(row(page, "Design the homepage"), "Rows show progress as done/total.");
    },
  }),

  tags: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await openTask(page, "Draft the sitemap");
      const input = drawer(page).getByLabel("New tag");
      await rec.type(input, "research", "Type a new tag and press Enter — it's created and added.");
      await input.press("Enter");
      await expect(page.getByRole("group", { name: "Tags" }).getByRole("button", { name: "research" })).toHaveAttribute("aria-pressed", "true");
      await rec.shot("drawer", "Tags toggled in the drawer");
      await rec.press("Escape");
      await rec.select(page.getByLabel("Tag"), { label: "@design" }, "Filter the list by tag.");
      await expect(row(page, "Design the homepage")).toBeVisible();
      await expect(page.getByText("Draft the sitemap")).toHaveCount(0);
      await rec.shot("filter", "The list filtered to one tag");
      await page.goto(`/w/${data.ws}/settings#tags`);
      const colours = page.getByRole("radiogroup", { name: "Colour of tag design" });
      await rec.click(colours.getByRole("radio", { name: "Green" }), "Rename, recolour or delete tags in Workspace settings.");
      await expect(colours.getByRole("radio", { name: "Green" })).toHaveAttribute("aria-checked", "true");
      await rec.shot("manage", "Managing tags in Workspace settings");
    },
  }),

  "comments-and-mentions": scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      await api.join(sample.team, "member");
      return sample;
    },
    run: async ({ page, rec, data }) => {
      rec.note("Milo joined the workspace before the recording.");
      await openList(page, data.team.url);
      await openTask(page, "Write the creative brief");
      const box = drawer(page).getByPlaceholder("Write a comment…");
      await rec.type(box, "@Mi", "Type @ to mention a teammate…");
      await rec.press("Enter", "…pick them from the suggestions…");
      await box.pressSequentially("could you review this by Friday?", { delay: 30 });
      await rec.click(drawer(page).getByRole("button", { name: "Comment", exact: true }), "…and post. Milo gets a notification and an email.");
      const comment = drawer(page).locator('li[id^="comment-"]:not([id^="comment-tmp-"])');
      await expect(comment).toContainText("could you review this by Friday?");
      await rec.shot("posted", "A comment mentioning a teammate");
      await comment.hover();
      await rec.click(comment.getByRole("button", { name: "Edit comment" }), "Authors can edit their comments…");
      await rec.type(comment.getByRole("combobox"), "Could you review this by Thursday instead?");
      await rec.click(comment.getByRole("button", { name: "Save" }));
      await expect(comment).toContainText("edited");
      await rec.point(comment, "…and edits are marked.");
      await rec.shot("edited", "An edited comment");
    },
  }),

  attachments: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await openTask(page, "Write the creative brief");
      await expect(drawer(page).getByText("No attachments. Drop files here or attach them.")).toBeVisible();
      await rec.point(drawer(page).getByRole("button", { name: "Attach files" }), "Drop files on the drawer or choose Attach files.");
      await drawer(page).locator('input[type="file"]').setInputFiles([
        { name: "creative-brief.txt", mimeType: "text/plain", buffer: Buffer.from("Northwind creative brief v1") },
        { name: "competitors.csv", mimeType: "text/csv", buffer: Buffer.from("name,url\nContoso,https://example.com\n") },
      ]);
      await expect(drawer(page).getByText("Attachments · 2")).toBeVisible();
      await rec.point(drawer(page).getByRole("link", { name: "creative-brief.txt" }), "Files are private to the workspace and open from the task.");
      await rec.shot("attached", "Two files attached to a task");
    },
  }),

  "trash-and-undo": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await rec.click(row(page, "Choose a hosting plan").getByRole("button", { name: "Delete" }), "Delete a task…");
      await expect(row(page, "Choose a hosting plan")).toHaveCount(0);
      await rec.shot("deleted", "Undo offered right after deleting");
      await rec.click(page.getByRole("button", { name: "Undo" }), "…and Undo brings it straight back.");
      await expect(row(page, "Choose a hosting plan")).toBeVisible();
      await rec.click(row(page, "Choose a hosting plan").getByRole("button", { name: "Delete" }), "Deleted for real?");
      await rec.click(page.getByRole("link", { name: "Trash", exact: true }), "It waits in Trash.");
      const item = page.locator("li", { hasText: "Choose a hosting plan" });
      await expect(item).toContainText("Website Relaunch");
      await rec.shot("trash", "Deleted tasks in Trash");
      await rec.click(item.getByRole("button", { name: "Restore" }), "Restore puts it back where it was.");
      await expect(page.getByText("Restored “Choose a hosting plan”.")).toBeVisible();
      await rec.pause(1200);
    },
  }),

  "task-links": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openList(page, data.team.url);
      await openTask(page, "Draft the sitemap");
      await rec.click(drawer(page).getByRole("button", { name: "Copy link" }), "Copy link gives a task's lasting address.");
      await rec.shot("copy", "Copy link in the drawer");
      await rec.press("Escape");
      const link = `/w/${data.ws}/t/${data.tasks.sitemap.id}`;
      rec.say("Opening it finds the task wherever it lives now, and opens it.");
      await page.goto(link);
      await expect(page).toHaveURL(new RegExp(`\\?task=${data.tasks.sitemap.id}$`));
      await expect(drawer(page).getByRole("textbox", { name: "Task title" })).toHaveValue("Draft the sitemap");
      await rec.pause(1500);
      await rec.shot("opened", "A task link opening the task");
    },
  }),
};

