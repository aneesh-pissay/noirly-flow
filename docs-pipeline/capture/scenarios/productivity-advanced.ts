import { expect } from "@playwright/test";
import { USERS } from "../../../e2e/env";
import { drawer, openList, openTask, row, scenario, waitForTasks, type Scenario } from "../scenario";

export const productivityAdvancedScenarios: Record<string, Scenario> = {
  "command-palette": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.click(page.getByRole("button", { name: /^Search/ }), "Open the palette from Search, or press Ctrl K.");
      const input = page.getByPlaceholder("Create a task, search, or jump…");
      await expect(input).toBeVisible();
      await rec.shot("open", "The command palette");
      await rec.type(input, "homepage", "Type to search tasks and workspaces…");
      const hit = page.getByRole("option", { name: /^Design the homepage/ });
      await expect(hit).toBeVisible();
      await rec.shot("results", "Search results in the palette");
      await rec.click(hit, "…and open a hit straight in the drawer.");
      await expect(page).toHaveURL(new RegExp(`task=${data.tasks.homepage.id}`));
      await rec.press("Escape");
      await rec.press("Control+k", "It also creates tasks and jumps to pages.");
      await rec.type(input, "Book the photographer");
      await rec.click(page.getByText("Create task “Book the photographer”"));
      await expect(page.getByRole("dialog", { name: "Create task" }).getByRole("textbox", { name: "Title" })).toHaveValue("Book the photographer");
      await rec.pause(1000);
      await rec.press("Escape");
    },
  }),

  "focus-timer": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      rec.note("Time is fast-forwarded in this video so a whole session fits in a few seconds.");
      await page.clock.install();
      await openList(page, data.team.url);
      await openTask(page, "Write the creative brief");
      await rec.select(drawer(page).getByLabel("Focus length"), "25", "Pick a focus length…");
      await rec.click(drawer(page).getByRole("button", { name: "Start focus" }), "…and start. A floating timer follows you around Flow.");
      const timer = page.getByRole("region", { name: "Focus timer" });
      await expect(timer.getByLabel("Time left")).toHaveText("25:00");
      await rec.shot("start", "A focus session started from the drawer");
      await page.clock.fastForward("10:00");
      await expect(timer.getByLabel("Time left")).toHaveText(/^1[45]:\d\d$/);
      await rec.click(timer.getByRole("button", { name: "Pause" }), "Pause when you're interrupted…");
      await expect(timer).toContainText("paused");
      await rec.shot("timer", "The floating focus timer, paused");
      await rec.click(timer.getByRole("button", { name: "Resume" }), "…and resume.");
      await page.clock.fastForward("16:00");
      await expect(timer.getByRole("status")).toHaveText("Focus session done.");
      rec.say("At the end, take a five-minute break — or log the time.");
      await rec.pause(1200);
      await rec.click(timer.getByRole("button", { name: "5-min break" }));
      await expect(timer).toContainText("Break");
      await rec.click(timer.getByRole("button", { name: "Stop" }));
      await expect(timer).toHaveCount(0);
    },
  }),

  "time-tracking": scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      await api.request.post("/api/me/time/stop");
      return sample;
    },
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await openTask(page, "Design the homepage");
      const time = page.locator("aside").getByRole("region", { name: "Time" });
      await rec.click(time.getByRole("button", { name: "Start timer" }), "Start a timer on the task…");
      const chip = page.getByRole("region", { name: "Running timer" });
      await expect(chip).toContainText("Design the homepage");
      await rec.point(chip, "…and it shows in the header wherever you go.");
      await rec.shot("running", "A running timer with the header chip");
      await rec.press("Escape");
      await rec.click(chip.getByRole("button", { name: "Stop timer" }), "Stop it from the header.");
      await expect(chip).toHaveCount(0);
      await openTask(page, "Design the homepage");
      await rec.type(time.getByLabel("Time spent"), "1h 30m", "Or add time by hand…");
      await rec.type(time.getByLabel("Note"), "Wireframes");
      await rec.click(time.getByRole("button", { name: "Add time" }));
      await expect(time.getByRole("list", { name: "Time entries" })).toContainText("Wireframes");
      await rec.point(time, "Everyone's entries add up to the task's total.");
      await rec.shot("added", "Time entries on a task");
    },
  }),

  notifications: scenario({
    user: "member",
    setup: async (api) => {
      // Recorded as Milo; the owner's actions happen through the owner's own account.
      const owner = await api.as("owner");
      const created = await owner.post("/api/workspaces", { data: { name: "Northwind Studio" } });
      const { workspace } = await created.json();
      api.onCleanup(() => owner.delete(`/api/workspaces/${workspace.id}`));
      const { projects } = await (await owner.get(`/api/workspaces/${workspace.id}`)).json();
      const project = projects[0];
      const { invite } = await (await owner.post(`/api/workspaces/${workspace.id}/invites`, { data: { role: "member" } })).json();
      await api.request.post("/api/invites/accept", { data: { token: invite.token } });
      await api.request.post("/api/notifications/read", { data: {} });
      const me = await api.me();
      const { task } = await (await owner.post(`/api/workspaces/${workspace.id}/tasks`, { data: { title: "Review the launch checklist", projectId: project.id } })).json();
      await owner.patch(`/api/tasks/${task.id}`, { data: { assigneeIds: [me.id] } });
      const tag = `@${USERS.member.name}`;
      await owner.post(`/api/tasks/${task.id}/comments`, { data: { body: `${tag} can you take this one?`, mentions: [{ userId: me.id, start: 0, end: tag.length }] } });
      return { owner, workspace, project, task };
    },
    run: async ({ page, rec, data }) => {
      rec.note("Olive assigned and mentioned Milo from her own account before the recording; this video is Milo's view.");
      await page.goto(`/w/${data.workspace.id}/p/${data.project.id}`);
      await waitForTasks(page);
      const bell = page.getByRole("button", { name: /^Notifications, 2 unread$/ });
      await expect(bell).toBeVisible();
      await rec.click(bell, "The bell shows what's waiting for you.");
      const panel = page.getByRole("dialog", { name: "Notifications" });
      await expect(panel.getByText(`${USERS.owner.name} assigned you`)).toBeVisible();
      await rec.shot("panel", "The notifications panel");
      await rec.click(panel.getByRole("button", { name: /assigned you/ }), "Click one to open its task.");
      await expect(page).toHaveURL(new RegExp(`task=${data.task.id}`));
      await expect(page.getByRole("button", { name: /^Notifications, 1 unread$/ })).toBeVisible();
      rec.say("It's marked read; the count drops.");
      await rec.pause(1200);
    },
  }),

  "activity-log": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.click(page.getByRole("link", { name: "Activity", exact: true }), "Activity records every change in the workspace.");
      await expect(page.getByText(`${USERS.owner.name} created a task “Choose a hosting plan”`)).toBeVisible();
      await rec.shot("feed", "The workspace activity log");
      const download = page.waitForEvent("download");
      await rec.click(page.getByRole("button", { name: "Export CSV" }), "Export the whole log as CSV.");
      expect((await download).suggestedFilename()).toMatch(/\.csv$/);
      await rec.pause(800);
    },
  }),

  automations: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      await api.tag(sample.ws, "escalated");
      await api.task(sample.ws, { title: "Checkout bug on mobile", projectId: sample.pid });
      return sample;
    },
    run: async ({ page, rec, data, api }) => {
      await openList(page, data.team.url);
      await rec.click(page.getByRole("button", { name: "Automations" }), "Open Automations from the project header.");
      const dialog = page.getByRole("dialog", { name: "Automations" });
      await expect(dialog.getByText("No automations yet.")).toBeVisible();
      await rec.shot("empty", "The Automations dialog");
      await rec.type(dialog.getByLabel("Name"), "Escalate bugs", "Name the rule, then build it: when…");
      await rec.select(dialog.getByLabel("Trigger"), { label: "Status changes" });
      await rec.select(dialog.getByLabel("Changes to"), { label: "to In progress" });
      await rec.click(dialog.getByRole("button", { name: "+ Add condition" }), "…if…");
      await rec.select(dialog.getByLabel("condition 1", { exact: true }), { label: "Title contains" });
      await rec.type(dialog.getByLabel("condition 1 value"), "bug");
      await rec.select(dialog.getByLabel("action 1", { exact: true }), { label: "Set priority" }, "…then.");
      await rec.select(dialog.getByLabel("action 1 value"), { label: "Urgent" });
      await rec.click(dialog.getByRole("button", { name: "+ Add action" }));
      await rec.select(dialog.getByLabel("action 2", { exact: true }), { label: "Add tag" });
      await rec.select(dialog.getByLabel("action 2 value"), { label: "#escalated" });
      const sentence = "When a task moves to In progress, if the title contains “bug”, then set priority to Urgent and add tag #escalated.";
      await expect(dialog.getByText(sentence)).toBeVisible();
      await rec.point(dialog.getByText(sentence), "The rule reads back as a sentence.");
      await rec.shot("builder", "Building a when → if → then rule");
      await rec.click(dialog.getByRole("button", { name: "Add automation" }));
      await expect(dialog.locator('[data-rule="Escalate bugs"]')).toContainText("Hasn't run yet");
      await rec.press("Escape");
      await rec.select(row(page, "Checkout bug on mobile").locator("select").first(), "in_progress", "Now start a bug…");
      await expect.poll(async () => (await (await api.get(`/api/workspaces/${data.ws}/tasks?projectId=${data.pid}`)).json()).tasks.find((t: { title: string }) => t.title === "Checkout bug on mobile")?.priority).toBe("urgent");
      await openList(page, data.team.url);
      await expect(row(page, "Checkout bug on mobile")).toContainText("@escalated");
      await rec.point(row(page, "Checkout bug on mobile"), "…and the rule made it urgent and tagged it.");
      await rec.click(page.getByRole("button", { name: "Automations" }));
      await expect(dialog.locator('[data-rule="Escalate bugs"]')).toContainText("Ran 1 time");
      await rec.shot("saved", "A rule with its run count");
    },
  }),

  approvals: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      const milo = await api.join(sample.team, "member");
      return { ...sample, milo };
    },
    run: async ({ page, rec, data }) => {
      rec.note("Milo's decision is made from his own account, off camera.");
      await openList(page, data.team.url);
      await openTask(page, "Write the creative brief");
      await rec.select(page.getByLabel("Approver"), { label: USERS.member.name }, "Pick who should approve…");
      await rec.click(page.getByRole("button", { name: "Request approval" }), "…and request it.");
      await expect(page.getByText(`Waiting on ${USERS.member.name}, asked by ${USERS.owner.name}.`)).toBeVisible();
      await rec.shot("requested", "An approval waiting on a teammate");
      await rec.press("Escape");
      await expect(row(page, "Write the creative brief")).toContainText("Awaiting approval");
      await rec.point(row(page, "Write the creative brief"), "Until it's approved, the task can't be marked done.");
      await data.milo.post(`/api/tasks/${data.tasks.brief.id}/approval/decision`, { data: { decision: "approve", note: "Looks great." } });
      await page.reload();
      await waitForTasks(page);
      await page.getByRole("button", { name: "List", exact: true }).click();
      await expect(row(page, "Write the creative brief")).toContainText("Approved");
      await rec.point(row(page, "Write the creative brief"), "Milo approves — now it can be finished.");
      await openTask(page, "Write the creative brief");
      await rec.shot("decided", "An approved task");
    },
  }),

  dependencies: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await openTask(page, "Design the homepage");
      await rec.type(page.getByLabel("Find a task this waits on"), "sitemap", "Under Blocked by, find the task this one waits on…");
      await rec.click(page.getByRole("list", { name: "Matching tasks" }).getByRole("button", { name: "Draft the sitemap" }), "…and pick it.");
      await rec.shot("linked", "A blocker linked in the drawer");
      await rec.press("Escape");
      await expect(row(page, "Design the homepage")).toContainText("Blocked");
      await rec.point(row(page, "Design the homepage"), "The task is Blocked until the sitemap is done.");
      await rec.shot("blocked", "A Blocked badge on the row");
      await rec.select(row(page, "Design the homepage").locator("select").first(), "done", "Finishing it early is refused.");
      await expect(page.getByText(/is waiting on other tasks/)).toBeVisible();
      await rec.pause(1500);
    },
  }),

  "custom-fields": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await rec.click(page.getByRole("button", { name: "Fields" }), "Open Fields from the project header.");
      const dialog = page.getByRole("dialog", { name: "Custom fields" });
      await rec.type(page.getByLabel("New field"), "Client", "Add a text field…");
      await rec.select(page.getByLabel("Field type"), { label: "Text" });
      await rec.click(page.getByRole("button", { name: "Add field" }));
      await expect(dialog.locator('[data-field="Client"]')).toBeVisible();
      await rec.type(page.getByLabel("New field"), "Size", "…and a select with options.");
      await rec.select(page.getByLabel("Field type"), { label: "Select" });
      await rec.type(page.getByLabel("Options, separated by commas"), "S, M, L");
      await rec.click(page.getByRole("button", { name: "Add field" }));
      await expect(dialog.locator('[data-field="Size"]')).toBeVisible();
      await rec.shot("dialog", "The custom fields dialog");
      await rec.press("Escape");
      await openTask(page, "Design the homepage");
      await rec.type(page.getByLabel("Client", { exact: true }), "Northwind", "Set values in the drawer.");
      await page.getByLabel("Client", { exact: true }).press("Tab");
      await rec.select(page.getByLabel("Size", { exact: true }), { label: "L" });
      await rec.shot("drawer", "Custom field values in the drawer");
      await rec.press("Escape");
      await expect(row(page, "Design the homepage")).toContainText("Client: Northwind");
      await rec.point(row(page, "Design the homepage"), "They show as chips on the row.");
      await rec.shot("row", "Custom field chips on a list row");
    },
  }),

  templates: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      const onboard = await api.task(sample.ws, { title: "Onboard a new designer", projectId: sample.pid, priority: "high" });
      await api.task(sample.ws, { title: "Order a laptop", projectId: sample.pid, parentTaskId: onboard.id });
      await api.task(sample.ws, { title: "Create accounts", projectId: sample.pid, parentTaskId: onboard.id });
      return sample;
    },
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await openTask(page, "Onboard a new designer");
      page.once("dialog", (dialog) => void dialog.accept("Designer onboarding"));
      await rec.click(page.getByRole("button", { name: "Save as template" }), "Save a task — with its subtasks — as a template.");
      await expect(page.getByText("Saved “Designer onboarding”")).toBeVisible();
      await rec.shot("saved", "A task saved as a template");
      await rec.press("Escape");
      await rec.click(page.getByRole("button", { name: "New task", exact: true }), "Next time, start from it.");
      const dialog = page.getByRole("dialog", { name: "Create task" });
      await expect(dialog.getByText("Not created yet")).toBeVisible();
      await rec.select(dialog.getByLabel(/From template/), { label: "Designer onboarding" });
      await expect(dialog.getByText("Also adds 2 subtasks.")).toBeVisible();
      await rec.type(dialog.getByRole("textbox", { name: "Title" }), "Onboard Priya", "Adjust the title — your edits win…");
      await rec.shot("use", "Starting a task from a template");
      await rec.click(dialog.getByRole("button", { name: "Create task", exact: true }), "…and the subtasks come along.");
      await expect(dialog).toBeHidden();
      await rec.pause(1200);
    },
  }),

  "bulk-edit": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await rec.click(page.getByRole("button", { name: "Select", exact: true }), "Choose Select to edit many tasks at once.");
      const bar = page.getByRole("region", { name: "Bulk edit" });
      await expect(bar).toContainText("0 selected");
      await rec.shot("select", "Select mode with the bulk edit bar");
      await rec.check(page.getByRole("checkbox", { name: "Select Draft the sitemap" }), "Tick tasks…");
      await rec.check(page.getByRole("checkbox", { name: "Select Homepage copy deck" }));
      await rec.check(page.getByRole("checkbox", { name: "Select Choose a hosting plan" }));
      await expect(bar).toContainText("3 selected");
      await rec.shot("picked", "Three tasks selected");
      await rec.select(bar.getByLabel("Set priority"), "high", "…then change them together.");
      await expect(bar).toContainText("3 tasks updated.");
      await rec.shot("applied", "Three tasks updated at once");
      await rec.click(bar.getByRole("button", { name: "Done" }), "Done leaves select mode.");
      await expect(bar).toHaveCount(0);
    },
  }),
};
