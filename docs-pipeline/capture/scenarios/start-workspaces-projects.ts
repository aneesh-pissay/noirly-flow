import { expect } from "@playwright/test";
import { USERS } from "../../../e2e/env";
import { blur, column, openList, openTask, row, scenario, titleButton, waitForTasks, type Scenario } from "../scenario";

export const startWorkspacesProjects: Record<string, Scenario> = {
  overview: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.point(page.getByRole("link", { name: /^Northwind Studio/ }), "Work lives in workspaces: your private Personal one, plus shared teams.");
      await rec.shot("shell", "The main sidebar with Search, workspaces and navigation");
      await rec.point(page.getByRole("link", { name: "Website Relaunch", exact: true }), "Inside a workspace: planning pages, the Inbox and your projects.");
      await rec.shot("project", "A project open on its board");
      await rec.click(titleButton(page, "Write the creative brief"), "Click any task to edit it in the drawer, without leaving the board.");
      await expect(page.getByRole("button", { name: "Close task" })).toBeVisible();
      await rec.pause(1500);
      await rec.shot("drawer", "The task drawer open beside the board");
      await rec.press("Escape", "Escape closes it.");
      await rec.press("Control+k", "Ctrl K opens the command palette: create, search or jump anywhere.");
      await expect(page.getByPlaceholder("Create a task, search, or jump…")).toBeVisible();
      await rec.pause(1200);
      await rec.press("Escape");
    },
  }),

  "signing-in": scenario({
    run: async ({ page, rec }) => {
      rec.note("The Noirly Identity popup isn't recorded: the isolated test server signs in with a test session instead of a live account.");
      await page.goto("/inbox");
      await expect(page.getByRole("link", { name: /^Personal/ })).toBeVisible();
      rec.say("Signed in, Flow opens your Personal workspace — created for you on your first visit.");
      await rec.pause(1500);
      await rec.shot("personal", "The Personal workspace after signing in");
      await rec.point(page.getByRole("button", { name: /sign out/i }), "Sign out sits at the bottom of the main sidebar.");
      await rec.shot("signout", "Sign out at the bottom of the main sidebar");
      await rec.click(page.getByRole("button", { name: /sign out/i }));
      await page.waitForURL(/\/login$/);
      await expect(page.getByText("Opens Identity in a secure popup")).toBeVisible();
      rec.say("You're back on the sign-in page. Noirly Login opens Identity in a secure popup.");
      await rec.pause(1800);
      await rec.shot("login", "The sign-in page with Noirly Login");
    },
  }),

  "navigating-flow": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.point(page.getByRole("link", { name: /^Northwind Studio/ }), "The main sidebar lists your workspaces.");
      await rec.shot("workspaces", "Workspaces in the main sidebar");
      await rec.click(page.getByRole("link", { name: "Today", exact: true }), "The workspace sidebar has planning pages: Today…");
      await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
      await rec.shot("workspace-nav", "The workspace sidebar with Today open");
      await rec.click(page.getByRole("link", { name: "Upcoming", exact: true }), "…Upcoming…");
      await rec.click(page.getByRole("link", { name: "Timeline", exact: true }), "…Timeline, Capacity, Habits, Stats, Review and Goals.");
      await rec.point(page.getByRole("button", { name: /^Notifications/ }), "In the header: notifications…");
      await rec.point(page.getByRole("button", { name: "Choose color palette" }), "…and theme controls.");
      await rec.shot("header", "Header controls: notifications, app switcher and theme");
      await rec.click(page.getByRole("link", { name: "Docs", exact: true }), "And these Docs are always one click away.");
      await expect(page).toHaveURL(/\/docs$/);
      await rec.pause(1200);
    },
  }),

  "keyboard-shortcuts": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await page.mouse.click(900, 140);
      await rec.press("1", "Press 1 for the list…");
      await expect(page.getByRole("button", { name: "Select", exact: true })).toBeVisible();
      await rec.press("/", "/ jumps to the task search.");
      await page.keyboard.type("brief", { delay: 60 });
      await expect(row(page, "Write the creative brief")).toBeVisible();
      await rec.pause(900);
      await page.getByPlaceholder("Search tasks… (/)").fill("");
      await page.getByPlaceholder("Search tasks… (/)").blur();
      await rec.press("2", "2 for the board…");
      await rec.press("3", "3 for the calendar…");
      await rec.press("4", "4 for the Gantt chart.");
      await rec.shot("views", "The Gantt view, reached with the 4 key");
      await rec.press("c", "C (or Ctrl K) opens the command palette.");
      await expect(page.getByPlaceholder("Create a task, search, or jump…")).toBeVisible();
      await rec.shot("palette", "The command palette");
      await rec.press("Escape", "Escape closes it.");
    },
  }),

  workspaces: scenario({
    run: async ({ page, rec, api }) => {
      await page.goto("/inbox");
      await rec.click(page.getByRole("button", { name: /new team workspace/i }), "Choose New team workspace.");
      await rec.type(page.getByPlaceholder("Team name"), "Design Guild", "Name the team…");
      await rec.shot("create", "Creating a team workspace from the sidebar");
      await rec.click(page.getByRole("button", { name: "Create", exact: true }), "…and create it. You're its owner.");
      const link = page.getByRole("link", { name: /^Design Guild/ });
      await expect(link).toBeVisible();
      await api.adopt("Design Guild");
      await rec.click(link, "Open it: Flow lands on its starter project, General.");
      await expect(page).toHaveURL(/\/p\/[a-f0-9]{24}/);
      await expect(page.getByText("General").first()).toBeVisible();
      await rec.shot("general", "A new team workspace with its General project");
      await rec.click(page.getByRole("link", { name: "Workspace", exact: true }), "Rename it in Workspace settings.");
      await rec.type(page.getByLabel("Workspace name"), "Design Guild Studio");
      await rec.click(page.getByRole("button", { name: "Save", exact: true }));
      await expect(page.getByRole("link", { name: /^Design Guild Studio/ })).toBeVisible();
      await rec.point(page.getByRole("button", { name: "Delete workspace" }), "Owners can delete a team in the Danger zone, after typing its name.");
    },
  }),

  "members-and-roles": scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      await api.join(sample.team, "member", "member");
      await api.join(sample.team, "editor", "member");
      return sample;
    },
    run: async ({ page, rec, data }) => {
      rec.note("Milo and Edie joined through invites before the recording.");
      await page.goto(`/w/${data.ws}/members`);
      await expect(page.locator("tr", { hasText: USERS.member.email })).toBeVisible();
      rec.say("Members lists everyone in the workspace with their role.");
      await rec.pause(1400);
      await rec.shot("table", "The Members table with roles");
      await rec.select(page.locator("tr", { hasText: USERS.member.email }).locator("select"), "viewer", "Change a role from its dropdown — here Milo becomes a Viewer.");
      await expect(page.locator("tr", { hasText: USERS.member.email }).locator("select")).toHaveValue("viewer");
      await rec.click(page.locator("tr", { hasText: USERS.editor.email }).getByRole("button", { name: "Remove" }), "Remove takes someone out of the workspace at once.");
      await expect(page.locator("tr", { hasText: USERS.editor.email })).toHaveCount(0);
      await rec.pause(1000);
    },
  }),

  invites: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await blur(page, "input[readonly]");
      await page.goto(`/w/${data.ws}/members`);
      await rec.type(page.getByLabel("Email address"), "sam@example.test", "Invite by email: type their address…");
      await rec.select(page.getByLabel("Role for emailed invite"), "viewer", "…pick the role they'll join with…");
      await rec.click(page.getByRole("button", { name: "Send invite" }), "…and send it. Only that address can accept it.");
      await expect(page.getByRole("status")).toHaveText("Invitation sent to sam@example.test");
      await rec.shot("email", "An emailed invite sent from the Members page");
      await rec.select(page.getByLabel("Role for invite link"), "member", "Or make a one-time link to share yourself.");
      await rec.click(page.getByRole("button", { name: "Generate link" }));
      await expect(page.locator("input[readonly]")).toHaveValue(/\/invite\/[\w-]+$/);
      await rec.shot("link", "A one-time invite link (blurred here)");
      const pending = page.getByRole("list", { name: "Pending invites" });
      await expect(pending.getByRole("listitem")).toHaveCount(2);
      await rec.point(pending, "Unused invites are listed under Pending invites.");
      await rec.shot("pending", "Pending invites with Revoke");
      await rec.click(page.getByRole("button", { name: "Revoke invite for Invite link" }), "Revoke kills a link immediately.");
      await expect(pending.getByRole("listitem")).toHaveCount(1);
    },
  }),

  "workspace-settings": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(`/w/${data.ws}/settings`);
      await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
      rec.say("Workspace settings: jump links to every section.");
      await rec.pause(1200);
      await rec.shot("page", "Workspace settings with section links");
      await rec.click(page.getByRole("radio", { name: "Icon 🚀" }), "Give the workspace an icon…");
      await rec.click(page.getByRole("radiogroup", { name: "Colour", exact: true }).getByRole("radio", { name: "Green" }), "…on a colour. It shows in the sidebar.");
      await expect(page.locator("a", { hasText: "Northwind Studio" }).first()).toContainText("🚀");
      await rec.shot("appearance", "An emoji icon on a colour");
      await rec.select(page.getByLabel("Default view for new projects"), { label: "List" }, "Choose the view new projects open in.");
      await rec.type(page.getByLabel("Name for Todo"), "Backlog", "Rename statuses to match how your team talks…");
      await rec.type(page.getByLabel("Name for Done"), "Shipped");
      await rec.click(page.getByRole("button", { name: "Save names" }), "…and save. The names apply everywhere.");
      await expect(page.getByLabel("Name for Done")).toHaveValue("Shipped");
      await rec.shot("statuses", "Custom status names");
    },
  }),

  projects: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.click(page.getByRole("button", { name: "New", exact: true }).first(), "Choose New in the workspace sidebar.");
      await rec.type(page.getByPlaceholder("Project name"), "Brand Refresh", "Name the project…");
      await rec.shot("create", "Creating a project");
      await rec.click(page.getByRole("button", { name: "Add", exact: true }).first(), "…and add it.");
      const link = page.getByRole("link", { name: "Brand Refresh", exact: true });
      await expect(link).toBeVisible();
      await rec.point(link);
      await rec.click(page.getByRole("button", { name: "Add Brand Refresh to favourites" }), "Star it to pin it under Favourites.");
      await expect(page.getByRole("list", { name: "Favourite projects" })).toContainText("Brand Refresh");
      await rec.shot("favourite", "A starred project under Favourites");
      await rec.point(page.getByRole("link", { name: "Website Relaunch", exact: true }).last());
      await rec.click(page.getByRole("button", { name: "Edit Website Relaunch" }), "The pencil edits a project: name, colour, archive, delete.");
      await rec.click(page.getByRole("radiogroup", { name: "Project colour" }).getByRole("radio", { name: "Violet" }), "Pick a colour…");
      await rec.shot("edit", "Editing a project: name, colour, archive and delete");
      await rec.click(page.locator("form", { has: page.getByLabel("Project name") }).getByRole("button", { name: "Save", exact: true }));
      await expect(page.locator("form", { has: page.getByLabel("Project name") })).toHaveCount(0);
      await rec.point(page.getByRole("link", { name: "Brand Refresh", exact: true }).last());
      await rec.click(page.getByRole("button", { name: "Edit Brand Refresh" }), "Archive hides a finished project and its tasks everywhere.");
      await rec.click(page.locator("form", { has: page.getByLabel("Project name") }).getByRole("button", { name: "Archive" }));
      await rec.click(page.locator("aside").getByRole("button", { name: /^Archived \(\d+\)$/ }), "Archived projects wait under Archived.");
      await expect(page.getByRole("list", { name: "Archived projects" })).toContainText("Brand Refresh");
      await rec.pause(1000);
    },
  }),

  sections: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      rec.say("Sections group the list view by phase or area.");
      await rec.shot("list", "A project's list view");
      await rec.click(page.getByRole("button", { name: "+ Add section" }), "Choose + Add section…");
      await rec.type(page.getByLabel("New section name"), "Planning");
      await rec.click(page.getByRole("button", { name: "Add section", exact: true }), "…name it and add it.");
      await expect(page.getByRole("group", { name: "Section Planning" })).toBeVisible();
      await rec.shot("add", "A new, empty section");
      await openTask(page, "Draft the sitemap");
      rec.say("Put a task in a section from its drawer.");
      await rec.select(page.getByLabel("Section", { exact: true }), { label: "Planning" });
      await rec.press("Escape");
      await expect(page.getByRole("group", { name: "Section Planning" })).toContainText("Draft the sitemap");
      rec.say("The list now groups by section; everything else sits under No section.");
      await rec.pause(1500);
      await rec.shot("grouped", "Tasks grouped by section");
    },
  }),

  "board-columns": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data, api }) => {
      await page.goto(data.team.url);
      await waitForTasks(page);
      rec.say("Every project starts with Todo, In progress and Done.");
      await rec.pause(1200);
      await rec.shot("board", "A project's board");
      await rec.click(page.getByRole("button", { name: "Add column" }), "Choose Add column…");
      await rec.type(page.getByLabel("Column name"), "Review");
      await rec.select(page.getByLabel("Cards here are"), "in_progress", "…and say which status its cards have.");
      await rec.shot("add", "Adding a Review column mapped to In progress");
      await rec.click(page.getByRole("button", { name: "Add", exact: true }));
      await expect(page.getByRole("heading", { level: 3, name: "Review", exact: true })).toBeVisible();
      await rec.click(page.getByRole("button", { name: "Edit column Review" }), "Edit column opens its settings…");
      await rec.click(page.getByRole("button", { name: "Move column left" }), "…where Left and Right reorder it — Review now sits before Done.");
      await expect.poll(async () => ((await (await api.get(`/api/projects/${data.pid}`)).json()).project.columns as Array<{ name: string }>).map((c) => c.name)).toEqual(["Todo", "In progress", "Review", "Done"]);
      await rec.click(page.getByRole("button", { name: "Cancel", exact: true }).first());
      await expect(page.getByRole("heading", { level: 3, name: "Review", exact: true })).toBeVisible();
      const grip = column(page, "Todo").locator("li", { hasText: "Collect moodboard references" }).getByText("⋮⋮");
      await rec.drag(grip, column(page, "Review").getByText("Drop tasks here"), "Drag cards into it by their grip.");
      await expect(column(page, "Review").getByText("Collect moodboard references")).toBeVisible();
      await rec.pause(1000);
    },
  }),

  "project-chat": scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      const milo = await api.join(sample.team, "member");
      await milo.post(`/api/projects/${sample.pid}/messages`, { data: { body: "Morning! I've started on the moodboard." } });
      return sample;
    },
    run: async ({ page, rec, data }) => {
      rec.note("Milo's message was posted from his own account before the recording.");
      await page.goto(data.team.url);
      await waitForTasks(page);
      await rec.click(page.getByRole("link", { name: "Chat" }), "Each project has its own chat — open it from the header.");
      await expect(page).toHaveURL(/\/chat$/);
      await rec.shot("open", "A project's chat");
      const box = page.getByLabel("Message", { exact: true });
      await rec.type(box, "Great — kickoff is Thursday at 10, agenda is in the brief.", "Type a message…");
      await rec.press("Enter", "…and press Enter to send.");
      await expect(page.getByRole("log").getByText("Great — kickoff is Thursday at 10")).toBeVisible();
      await rec.shot("sent", "A message sent in project chat");
    },
  }),
};

