import { expect } from "@playwright/test";
import { at, day } from "../api";
import { column, drawer, openList, openTask, row, scenario, titleButton, waitForTasks, type Scenario } from "../scenario";

const GANTT_DAY_PX = 28;
const TIMELINE_HOUR_PX = 48;

export const viewPlanningScenarios: Record<string, Scenario> = {
  "list-view": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.click(page.getByRole("button", { name: "List", exact: true }), "Switch to the list.");
      await rec.shot("list", "A project's list view");
      await rec.type(page.getByPlaceholder("Search tasks… (/)"), "home", "Search narrows it as you type…");
      await expect(row(page, "Design the homepage")).toBeVisible();
      await expect(row(page, "Draft the sitemap")).toHaveCount(0);
      await rec.shot("search", "The list narrowed by search");
      await rec.click(page.getByRole("button", { name: "Clear" }), "Clear resets everything.");
      const priority = page.locator("select", { has: page.locator('option[value=""]', { hasText: "Any priority" }) });
      await rec.select(priority, "high", "Filters combine: here, high priority only.");
      await expect(row(page, "Draft the sitemap")).toHaveCount(0);
      await rec.shot("filter", "The list filtered by priority");
      await rec.click(page.getByRole("button", { name: "Clear" }));
      await rec.select(row(page, "Draft the sitemap").locator("select").first(), "in_progress", "Change status and priority right on the row.");
      await expect(row(page, "Draft the sitemap").locator("select").first()).toHaveValue("in_progress");
    },
  }),

  "board-view": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data, api }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      rec.say("The board shows tasks as cards in their columns.");
      await rec.pause(1200);
      await rec.shot("board", "The board view");
      const grip = column(page, "Todo").locator("li", { hasText: "Collect moodboard references" }).getByText("⋮⋮");
      const done = (await column(page, "Done").locator("li").first().boundingBox())!;
      await rec.drag(grip, { x: done.x + done.width / 2, y: done.y + done.height + 30 }, "Drag a card by its grip to another column — its status follows.");
      await expect(column(page, "Done").getByText("Collect moodboard references")).toBeVisible();
      await expect.poll(async () => (await (await api.get(`/api/tasks/${data.tasks.moodboard.id}`)).json()).task.status).toBe("done");
      rec.say("It's saved: the task is now done.");
      await rec.pause(1200);
      await rec.shot("done", "The card moved to Done");
    },
  }),

  "calendar-view": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.click(page.getByRole("button", { name: "Calendar", exact: true }), "Calendar puts tasks on their due day.");
      await expect(page.getByText("Mon", { exact: true }).first()).toBeVisible();
      await rec.shot("calendar", "The month calendar");
      await rec.click(page.getByRole("button", { name: "Next", exact: true }), "Move between months…");
      await rec.click(page.getByRole("button", { name: "Prev", exact: true }));
      await rec.point(titleButton(page, "Choose a hosting plan"), "…and undated tasks are listed below the grid.");
      await rec.click(titleButton(page, "Write the creative brief"), "Click a task to open it.");
      await expect(drawer(page)).toBeVisible();
      await rec.pause(1000);
    },
  }),

  "gantt-view": scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      await api.patch(`/api/tasks/${sample.tasks.copydeck.id}`, { blockedByIds: [sample.tasks.homepage.id] });
      return sample;
    },
    run: async ({ page, rec, data, api }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.click(page.getByRole("button", { name: "Gantt", exact: true }), "Gantt draws each task from its start to its due date.");
      const bar = page.getByRole("button", { name: /^Design the homepage: / });
      await expect(bar).toBeVisible();
      await expect(page.locator('svg path[marker-end="url(#gantt-arrow)"]')).toHaveCount(1);
      await rec.point(page.locator('svg path[marker-end="url(#gantt-arrow)"]'), "Arrows show what's blocking what.");
      await rec.shot("gantt", "The Gantt chart with a dependency arrow");
      const before = (await (await api.get(`/api/tasks/${data.tasks.homepage.id}`)).json()).task.dueAt;
      const box = (await bar.boundingBox())!;
      await rec.drag(bar, { x: box.x + box.width - 2 + 2 * GANTT_DAY_PX, y: box.y + box.height / 2 }, "Drag a bar's end to change that date…", { x: box.x + box.width - 2, y: box.y + box.height / 2 });
      await expect.poll(async () => (await (await api.get(`/api/tasks/${data.tasks.homepage.id}`)).json()).task.dueAt).not.toBe(before);
      await rec.shot("resized", "A bar stretched by two days");
      const moved = (await bar.boundingBox())!;
      await rec.drag(bar, { x: moved.x + moved.width / 2 - GANTT_DAY_PX, y: moved.y + moved.height / 2 }, "…or drag the whole bar to move both dates.");
      await rec.pause(800);
    },
  }),

  timeline: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      const standup = await api.task(sample.ws, { title: "Team standup", projectId: sample.pid });
      await api.patch(`/api/tasks/${standup.id}`, { dueAt: at(9, 0, 30), dueHasTime: true, durationMinutes: 30 });
      const deep = await api.task(sample.ws, { title: "Deep work: homepage layout", projectId: sample.pid });
      await api.patch(`/api/tasks/${deep.id}`, { dueAt: at(10), dueHasTime: true, durationMinutes: 90 });
      return { ...sample, deep };
    },
    run: async ({ page, rec, data, api }) => {
      await page.goto(`/w/${data.ws}/timeline`);
      await expect(page.getByRole("heading", { level: 1, name: "Timeline" })).toBeVisible();
      rec.say("Timeline: your week hour by hour, across every project.");
      await rec.pause(1400);
      await rec.shot("week", "The week timeline");
      await rec.click(page.getByRole("button", { name: "Day", exact: true }), "Switch to a single day.");
      const block = page.getByRole("button", { name: /Deep work: homepage layout/ });
      await expect(block).toBeVisible();
      await rec.shot("day", "The day timeline with timed blocks");
      let box = (await block.boundingBox())!;
      await rec.drag(block, { x: box.x + box.width / 2, y: box.y + 10 + TIMELINE_HOUR_PX }, "Drag a block to a new time…", { x: box.x + box.width / 2, y: box.y + 10 });
      await expect.poll(async () => new Date((await (await api.get(`/api/tasks/${data.deep.id}`)).json()).task.dueAt).getHours()).toBe(11);
      box = (await block.boundingBox())!;
      await rec.drag(block, { x: box.x + box.width / 2, y: box.y + box.height - 2 + TIMELINE_HOUR_PX / 2 }, "…stretch it to change its length…", { x: box.x + box.width / 2, y: box.y + box.height - 2 });
      const item = page.getByRole("complementary", { name: "To schedule" }).getByRole("button", { name: /Choose a hosting plan/ });
      const col = (await page.locator("[data-timeline-day]").boundingBox())!;
      await rec.drag(item, { x: col.x + col.width / 2, y: col.y + 14.25 * TIMELINE_HOUR_PX }, "…or drag an unscheduled task onto the grid.", undefined);
      await expect.poll(async () => (await (await api.get(`/api/tasks/${data.tasks.hosting.id}`)).json()).task.dueHasTime).toBe(true);
      await rec.shot("scheduled", "A task dragged in from To schedule");
    },
  }),

  "today-and-upcoming": scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      await api.task(sample.ws, { title: "Send the invoice", projectId: sample.pid, dueAt: day(-2) });
      await api.task(sample.ws, { title: "Renew the domain", projectId: null, dueAt: day(0) });
      return sample;
    },
    run: async ({ page, rec, data }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.click(page.getByRole("link", { name: "Today", exact: true }), "Today gathers what's overdue and due today, from every project and the Inbox.");
      await expect(page.getByRole("group", { name: /Overdue/ })).toContainText("Send the invoice");
      await rec.shot("today", "Today with overdue and due-today tasks");
      await rec.click(page.getByRole("button", { name: "Complete Renew the domain" }), "Tick to complete.");
      await expect(page.getByText("Renew the domain", { exact: true })).toHaveCount(0);
      await rec.click(page.getByRole("link", { name: "Upcoming", exact: true }), "Upcoming shows the next 14 days, by day.");
      await expect(page.getByRole("group", { name: /^Tomorrow/ })).toContainText("Collect moodboard references");
      await rec.shot("upcoming", "Upcoming grouped by day");
    },
  }),

  "saved-filters": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(`/w/${data.ws}/filters`);
      await rec.type(page.getByLabel("Name"), "Hot this week", "Name a filter…");
      await rec.shot("form", "The new filter form");
      const query = page.getByLabel("Query");
      await rec.type(query, "next 7 days &", "…and write a query. It's checked as you type.");
      await expect(page.locator("#filter-query-help")).toHaveText("The query ends too early");
      await rec.shot("error", "A query error explained in words");
      await rec.type(query, "next 7 days & p1");
      await expect(page.getByRole("button", { name: "Save filter" })).toBeEnabled();
      await rec.click(page.getByRole("button", { name: "Save filter" }), "Save it.");
      await expect(page.getByRole("heading", { level: 1, name: "Hot this week" })).toBeVisible();
      await expect(page.getByText("Design the homepage")).toBeVisible();
      rec.say("The filter lists matching open tasks, and sits in your sidebar.");
      await rec.point(page.getByRole("link", { name: "Hot this week" }));
      await rec.shot("saved", "A saved filter's matching tasks");
    },
  }),

  goals: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(`/w/${data.ws}/goals`);
      await rec.type(page.getByLabel("New goal"), "Launch the new website", "Create a goal…");
      await rec.fill(page.getByLabel("Target date"), day(60), "…with a target date.");
      await rec.click(page.getByRole("button", { name: "Add goal" }));
      const card = page.getByRole("list", { name: "Goals" }).getByRole("listitem").filter({ hasText: "Launch the new website" });
      await expect(card).toContainText("No tasks yet");
      await rec.shot("list", "A goal with its target date");
      await rec.click(card.getByRole("link", { name: "Launch the new website" }), "Open it to add milestones and tasks.");
      await rec.type(page.getByLabel("New milestone"), "Design approved");
      await rec.click(page.getByRole("button", { name: "Add milestone" }));
      await rec.type(page.getByLabel("Add a task to this goal"), "Sign off the homepage", "Add tasks straight onto the goal…");
      await rec.select(page.getByLabel("Milestone", { exact: true }), { label: "Design approved" });
      await rec.click(page.getByRole("button", { name: "Add task" }));
      await rec.type(page.getByLabel("Add a task to this goal"), "Publish the launch post");
      await rec.select(page.getByLabel("Milestone", { exact: true }), { label: "No milestone" });
      await rec.click(page.getByRole("button", { name: "Add task" }));
      await rec.click(page.getByRole("button", { name: "Complete Sign off the homepage" }), "…and progress fills in as they're done.");
      await expect(page.getByRole("progressbar", { name: "Goal progress" })).toHaveAttribute("aria-valuenow", "50");
      await rec.shot("detail", "A goal's milestones and progress");
    },
  }),

  habits: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      const walk = await api.task(sample.ws, { title: "Morning walk", projectId: sample.pid, dueAt: day(0) });
      await api.patch(`/api/tasks/${walk.id}`, { recurrence: { frequency: "daily", interval: 1 } });
      return sample;
    },
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await openTask(page, "Morning walk");
      await rec.check(page.getByLabel(/Track as a habit/), "On a repeating task, tick Track as a habit.");
      await rec.shot("track", "Track as a habit under Repeat");
      await rec.press("Escape");
      await rec.click(page.getByRole("link", { name: "Habits", exact: true }), "Habits shows each one with its streak.");
      const card = page.getByRole("group", { name: "Habit Morning walk" });
      await expect(card.getByLabel("Current streak 0, best 0")).toBeVisible();
      await rec.shot("habits", "The Habits page");
      await rec.click(card.getByRole("button", { name: /^Done/ }), "Done on time keeps the streak going.");
      await expect(card.getByLabel("Current streak 1, best 1")).toBeVisible();
      await rec.shot("streak", "A habit with a one-day streak");
    },
  }),

  review: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      await api.task(sample.ws, { title: "Reply to the agency", projectId: sample.pid, dueAt: at(12, -2) });
      await api.task(sample.ws, { title: "Order business cards", projectId: sample.pid, dueAt: at(12) });
      await api.task(sample.ws, { title: "Approve the logo", projectId: sample.pid, dueAt: at(12), status: "done" });
      return sample;
    },
    run: async ({ page, rec, data }) => {
      await page.goto(`/w/${data.ws}/review`);
      await expect(page.getByRole("heading", { name: "Review" })).toBeVisible();
      await expect(page.getByRole("group", { name: /Done today/ })).toContainText("Approve the logo");
      rec.say("Review walks through your day: done, overdue, still open, tomorrow.");
      await rec.pause(1400);
      await rec.shot("daily", "The daily review");
      await rec.click(page.getByRole("button", { name: "Tomorrow: Order business cards" }), "Push what's left to tomorrow in one click.");
      await rec.click(page.getByRole("button", { name: "Mark reviewed" }), "Then mark the review done.");
      await expect(page.getByText(/Last reviewed/)).toBeVisible();
      await rec.click(page.getByRole("button", { name: "Weekly" }), "Weekly looks across the week and next week.");
      await expect(page.getByRole("group", { name: /Done this week/ })).toBeVisible();
      await rec.shot("weekly", "The weekly review");
    },
  }),

  stats: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      await api.task(sample.ws, { title: "Approve the logo", projectId: sample.pid, dueAt: day(0), status: "done" });
      await api.task(sample.ws, { title: "Send the proposal", projectId: sample.pid, dueAt: day(-1), status: "done" });
      await api.task(sample.ws, { title: "Reply to the agency", projectId: sample.pid, dueAt: day(-2) });
      await api.post(`/api/tasks/${sample.tasks.brief.id}/time`, { minutes: 95 });
      return sample;
    },
    run: async ({ page, rec, data }) => {
      await page.goto(`/w/${data.ws}/stats`);
      const summary = page.getByRole("list", { name: "Summary" });
      await expect(summary.getByRole("listitem").filter({ hasText: "Completed this week" })).toBeVisible();
      await rec.point(summary, "Stats counts your own work: done this week, on-time rate, overdue and time tracked.");
      await rec.shot("stats", "Your stats tiles and charts");
      const perDay = page.getByRole("figure", { name: /Completed per day/ });
      await rec.point(perDay.getByRole("listitem").last(), "Hover a column for its value…");
      await rec.click(perDay.getByRole("button", { name: "Show as table" }), "…or show the chart as a table.");
      await rec.shot("table", "A chart shown as a table");
    },
  }),

  capacity: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      const me = await api.me();
      await api.request.put(`/api/workspaces/${sample.ws}/members/${me.id}/capacity`, { data: { minutes: [480, 480, 480, 480, 480, 480, 480] } });
      const big = await api.task(sample.ws, { title: "Build the component library", projectId: sample.pid });
      await api.patch(`/api/tasks/${big.id}`, { dueAt: at(17), dueHasTime: true, durationMinutes: 600, assigneeIds: [me.id] });
      return { ...sample, me };
    },
    run: async ({ page, rec, data }) => {
      await page.goto(`/w/${data.ws}/capacity`);
      await expect(page.getByRole("heading", { level: 1, name: "Capacity" })).toBeVisible();
      const cell = page.getByRole("button", { name: new RegExp(`^${data.me.displayName}, .*: 10h of 8h, over by 2h$`) });
      await expect(cell).toBeVisible();
      await rec.point(cell, "Each cell is a person's work due that day against their hours — red when over.");
      await rec.shot("grid", "The capacity grid with an overloaded day");
      await rec.click(cell, "Click a cell to see that day's tasks.");
      await expect(page.getByRole("region", { name: "Tasks that day" })).toContainText("Build the component library");
      await rec.shot("cell", "A day's tasks from the capacity grid");
      await rec.click(page.getByRole("button", { name: "My hours" }), "Set your own hours per weekday.");
      const todayName = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date());
      await rec.type(page.getByLabel(`${todayName} hours`), "12");
      await rec.shot("hours", "Editing working hours");
      await rec.click(page.getByRole("button", { name: "Save hours" }));
      await expect(page.getByRole("button", { name: new RegExp(`^${data.me.displayName}, .*: 10h of 12h$`) })).toBeVisible();
      rec.say("Now the day fits.");
      await rec.pause(1200);
    },
  }),
};
