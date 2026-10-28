import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect } from "@playwright/test";
import { E2E_FAKE_CALENDAR_PORT } from "../../../e2e/env";
import { FakeCalendar } from "../../../e2e/fake-calendar";
import { blur, drawer, openList, openTask, row, scenario, type Scenario } from "../scenario";

/** A local webhook receiver that answers 200. */
async function receiver() {
  const server: Server = createServer((request, response) => {
    request.resume();
    request.on("end", () => response.writeHead(200).end("ok"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/hooks/flow`, close: () => new Promise((resolve) => server.close(resolve)) };
}

const TODOIST = [
  "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE",
  "section,Research,,,,,,,,",
  "task,Interview five customers @research,Recruit from the newsletter,1,1,Sam,,tomorrow,en,",
  "note,Ask about onboarding pain points,,,,,,,,",
  "task,Write the discussion guide,,2,2,Sam,,,en,",
  "task,Summarise findings,,3,1,Sam,,next friday,en,",
  "section,Build,,,,,,,,",
  "task,Prototype the new signup,,,1,,,every monday,en,",
].join("\n");

export const integrationSettingsScenarios: Record<string, Scenario> = {
  "intake-forms": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await openList(page, data.team.url);
      await rec.click(page.getByRole("button", { name: "Forms" }), "Open Forms from the project header.");
      const dialog = page.getByRole("dialog", { name: "Intake forms" });
      await expect(dialog.getByText("No forms yet.")).toBeVisible();
      await rec.shot("empty", "The intake forms dialog");
      await rec.click(dialog.getByRole("button", { name: "New form" }), "Create a form…");
      await rec.type(dialog.getByLabel("Form name"), "Design request");
      await rec.type(dialog.getByLabel("Question that becomes the task title"), "What do you need?", "Its first question becomes the task title.");
      await rec.click(dialog.getByRole("button", { name: "+ Add question" }), "Add more questions…");
      await rec.type(dialog.getByLabel("Question 1", { exact: true }), "Your email");
      await rec.select(dialog.getByLabel("Question 1 type"), { label: "Email" });
      await rec.check(dialog.getByRole("checkbox", { name: "Required" }));
      await rec.select(dialog.getByLabel("Priority"), { label: "High" }, "…and defaults for the tasks it creates.");
      await rec.shot("builder", "Building an intake form");
      await rec.click(dialog.getByRole("button", { name: "Save form" }));
      const formRow = dialog.locator('[data-form="Design request"]');
      await expect(formRow).toContainText("No responses yet");
      const link = await formRow.getByLabel("Link to Design request").inputValue();
      rec.say("Anyone with the link can respond — no account needed.");
      await page.goto(new URL(link).pathname);
      await expect(page.getByRole("heading", { name: "Design request" })).toBeVisible();
      await rec.type(page.getByLabel("What do you need?"), "Banner for the spring sale");
      await rec.type(page.getByLabel("Your email"), "pat@example.test");
      await rec.shot("public", "The public form a requester fills in");
      await rec.click(page.getByRole("button", { name: "Send" }), "Send…");
      await expect(page.getByRole("heading", { name: "Thanks, it's in" })).toBeVisible();
      await openList(page, data.team.url);
      await expect(row(page, "Banner for the spring sale")).toBeVisible();
      await rec.point(row(page, "Banner for the spring sale"), "…and the response is a task in the project, high priority.");
    },
  }),

  webhooks: scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      const hook = await receiver();
      api.onCleanup(hook.close);
      return { ...sample, hook };
    },
    run: async ({ page, rec, data }) => {
      rec.note("The endpoint is a local test receiver, which only this isolated test server allows; real servers accept public HTTPS addresses.");
      await blur(page, "#webhook-secret");
      await page.goto(`/w/${data.ws}/settings#webhooks`);
      const section = page.getByRole("region", { name: "Webhooks" });
      await expect(section.getByText("No webhooks yet.")).toBeVisible();
      await rec.shot("empty", "Webhooks in Workspace settings");
      await rec.type(section.getByLabel("Endpoint URL"), data.hook.url, "Add the URL that should receive events…");
      await rec.click(section.getByRole("button", { name: "Add webhook" }), "…and add it.");
      await expect(section.locator("#webhook-secret")).toBeVisible();
      await rec.point(section.locator("#webhook-secret"), "The signing secret is shown once (blurred here). Copy it now.");
      await rec.shot("secret", "A new webhook with its one-time secret");
      const hookRow = section.locator(`[data-webhook="${data.hook.url}"]`);
      await rec.click(hookRow.getByRole("button", { name: "Send test" }), "Send a test to check the receiver…");
      await expect(hookRow.getByRole("list", { name: `Deliveries to ${data.hook.url}` }).locator('[data-delivery="ping"]')).toContainText("200 OK");
      await rec.point(hookRow.getByRole("list", { name: `Deliveries to ${data.hook.url}` }), "…every delivery is logged, with Redeliver.");
      await rec.shot("log", "The delivery log");
    },
  }),

  "api-tokens": scenario({
    run: async ({ page, rec }) => {
      await blur(page, "#new-api-token, pre, code");
      await page.goto("/settings");
      const section = page.getByRole("region", { name: "API tokens" });
      await rec.point(section, "API tokens let scripts use Flow as you.");
      await rec.shot("section", "The API tokens section");
      await rec.type(section.getByLabel("Token name"), "Weekly report script", "Name the token, choose its access and expiry…");
      await rec.click(section.getByRole("button", { name: "Create token" }), "…and create it.");
      await expect(section.locator("#new-api-token")).toHaveValue(/^nfp_r_/);
      await rec.point(section.locator("#new-api-token"), "The secret is shown once, with a curl example (blurred here).");
      await rec.shot("created", "A new token, shown once");
      const tokenRow = section.getByRole("listitem").filter({ hasText: "Weekly report script" });
      page.once("dialog", (dialog) => void dialog.accept());
      await rec.click(tokenRow.getByRole("button", { name: "Revoke token Weekly report script" }), "Revoke stops a token at once.");
      await expect(tokenRow).toHaveCount(0);
    },
  }),

  "calendar-feed": scenario({
    setup: async (api) => {
      await api.request.delete("/api/me/calendar-feed");
      api.onCleanup(() => api.request.delete("/api/me/calendar-feed"));
      return null;
    },
    run: async ({ page, rec }) => {
      await blur(page, "input[readonly]");
      await page.goto("/settings");
      await rec.click(page.getByRole("button", { name: "Create calendar link" }), "Create a private calendar link…");
      await expect(page.getByLabel(/Your private calendar link/)).toHaveValue(/\/api\/calendar\/.+\.ics$/);
      await rec.point(page.getByRole("link", { name: "Add to Google Calendar" }), "…then subscribe from Google, Apple or Outlook (the link is blurred here).");
      await rec.shot("created", "A private calendar feed link");
    },
  }),

  "calendar-sync": scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      const fake = new FakeCalendar(E2E_FAKE_CALENDAR_PORT);
      await fake.start();
      api.onCleanup(async () => {
        await api.request.delete("/api/calendar-sync/google").catch(() => {});
        await fake.stop();
      });
      return sample;
    },
    run: async ({ page, rec }) => {
      rec.note("A stand-in for Google approves the connection: the isolated test server never talks to real Google accounts.");
      await page.goto("/settings");
      const google = page.locator('[data-calendar="google"]');
      await rec.point(google, "Two-way calendar sync connects Google Calendar or Outlook.");
      await rec.shot("section", "Two-way calendar sync in Settings");
      await rec.click(google.getByRole("link", { name: "Connect Google Calendar" }), "Connect, approve access…");
      await expect(page.getByText("Google Calendar is connected.")).toBeVisible();
      rec.say("…and Flow keeps a “Noirly Flow” calendar there in step with your tasks.");
      await rec.pause(1500);
      await rec.shot("connected", "Google Calendar connected");
    },
  }),

  import: scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(`/w/${data.ws}/settings#data`);
      await rec.select(page.getByLabel("Import into project"), { label: "Website Relaunch" }, "Pick the project to import into…");
      await page.getByLabel("CSV file to import").setInputFiles({ name: "todoist-research.csv", mimeType: "text/csv", buffer: Buffer.from(TODOIST) });
      rec.say("…and a CSV. A Todoist export is recognised automatically.");
      await expect(page.getByText("Todoist export")).toBeVisible();
      await rec.point(page.getByText("Todoist export"), "The preview shows what will be created — before anything is.");
      await rec.shot("preview", "The import preview for a Todoist export");
      await rec.click(page.getByRole("button", { name: /^Import \d+ tasks$/ }), "Import.");
      await expect(page.getByRole("status").filter({ hasText: /^Imported/ })).toBeVisible();
      const plain = "Name,When,Importance\nOrder business cards,next monday,High\nBook the venue,2030-03-02,low\n";
      await page.getByLabel("CSV file to import").setInputFiles({ name: "backlog.csv", mimeType: "text/csv", buffer: Buffer.from(plain) });
      rec.say("Any other CSV gets a column mapping.");
      await rec.select(page.getByLabel("Column for Due date"), { label: "When" });
      await rec.select(page.getByLabel("Column for Priority"), { label: "Importance" });
      await rec.shot("mapping", "Mapping CSV columns to task fields");
    },
  }),

  "export-and-backups": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data }) => {
      await page.goto(`/w/${data.ws}/settings#data`);
      const section = page.getByRole("region", { name: "Export" });
      await expect(section.getByRole("link", { name: "Everything (JSON)" })).toBeVisible();
      await rec.point(section.getByRole("link", { name: "Everything (JSON)" }), "Export everything as JSON, or tasks as CSV.");
      await rec.shot("export", "Export options");
      await rec.click(section.getByRole("button", { name: "Back up now" }), "Back up now…");
      await expect(section.getByRole("list", { name: "Backups" }).getByRole("listitem")).toHaveCount(1);
      await rec.check(section.getByRole("checkbox", { name: "Back up automatically" }), "…or every day or week, automatically.");
      await rec.select(section.getByLabel("How often"), "daily");
      await rec.shot("backup", "A backup and the automatic schedule");
    },
  }),

  "profile-settings": scenario({
    setup: async (api) => {
      api.onCleanup(() => api.request.patch("/api/me", { data: { profile: { title: null, bio: null } } }));
      return null;
    },
    run: async ({ page, rec }) => {
      await page.goto("/settings");
      await expect(page.getByLabel("Title")).toBeVisible();
      rec.say("Settings: your Noirly account, then your Flow profile.");
      await rec.pause(1000);
      await rec.shot("page", "Settings with the Flow profile");
      await rec.type(page.getByLabel("Title"), "Design lead", "Add a title…");
      await rec.fill(page.getByLabel("Bio"), "Prefers async updates.", "…a bio, and your time zone.");
      await rec.click(page.getByRole("button", { name: "Save Flow profile" }), "Save.");
      await expect(page.getByText("Saved", { exact: true })).toBeVisible();
      await rec.shot("edited", "A saved Flow profile");
    },
  }),

  "task-saving": scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      api.onCleanup(() => api.request.patch("/api/me", { data: { profile: { taskSaveMode: "auto" } } }));
      return sample;
    },
    run: async ({ page, rec, data }) => {
      await page.goto("/settings");
      await rec.select(page.locator("#task-save-mode"), "manual", "Choose how the task drawer saves: here, Manual.");
      await expect(page.getByText("Preference saved")).toBeVisible();
      await rec.shot("mode", "The task saving preference");
      await openList(page, data.team.url);
      await openTask(page, "Draft the sitemap");
      await rec.type(drawer(page).getByRole("textbox", { name: "Task title" }), "Draft the sitemap and URL plan", "Edits now wait…");
      await rec.click(drawer(page).getByRole("button", { name: "Save changes" }), "…until you choose Save changes.");
      await rec.shot("manual", "Save changes in manual mode");
      await rec.press("Escape");
      await expect(row(page, "Draft the sitemap and URL plan")).toBeVisible();
    },
  }),

  "layout-and-themes": scenario({
    setup: async (api) => {
      const sample = await api.sampleTeam();
      api.onCleanup(() => api.request.patch("/api/me", { data: { profile: { density: "comfortable", contentWidth: "standard" } } }));
      return sample;
    },
    run: async ({ page, rec, data }) => {
      await page.goto("/settings");
      await rec.point(page.getByRole("radiogroup", { name: "Density" }), "Layout: how dense and how wide.");
      await rec.shot("layout", "Layout settings");
      await rec.click(page.getByRole("radiogroup", { name: "Density" }).getByRole("radio", { name: /Compact/ }), "Compact fits more tasks…");
      await rec.click(page.getByRole("radiogroup", { name: "Page width" }).getByRole("radio", { name: /Wide/ }), "…Wide uses the whole window.");
      await expect(page.locator("html")).toHaveAttribute("data-width", "wide");
      await openList(page, data.team.url);
      await rec.shot("compact", "A compact, wide list");
      await rec.click(page.getByRole("button", { name: "Choose color palette" }), "Pick a colour palette…");
      const palettes = page.getByRole("dialog", { name: "Color palettes" }).getByRole("radio");
      await rec.click(palettes.nth(2));
      await rec.press("Escape");
      await rec.click(page.getByRole("button", { name: /^Switch to (light|dark) mode$/ }), "…and switch light or dark.");
      await rec.shot("theme", "A different palette and mode");
    },
  }),

  "install-and-offline": scenario({
    setup: (api) => api.sampleTeam(),
    run: async ({ page, rec, data, context }) => {
      await page.goto("/settings");
      await rec.point(page.getByRole("heading", { name: "Install Flow" }), "Install Flow from Settings, and it opens in its own window.");
      await rec.shot("install", "Install Flow in Settings");
      await openList(page, data.team.url);
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
      await page.reload();
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await openList(page, data.team.url);
      await context.setOffline(true);
      rec.say("Offline, pages you've opened before still load…");
      await page.reload();
      await expect(page.getByText(/You're offline\. Showing what was last loaded/)).toBeVisible();
      await page.getByRole("button", { name: "List", exact: true }).click();
      await rec.point(page.getByText(/You're offline\. Showing what was last loaded/));
      await rec.click(page.getByRole("button", { name: "New task", exact: true }), "…but changes need a connection, and say so straight away.");
      const dialog = page.getByRole("dialog", { name: "Create task" });
      await dialog.getByRole("textbox", { name: "Title" }).fill("Written offline");
      await rec.click(dialog.getByRole("button", { name: "Create task", exact: true }));
      await expect(dialog.getByText("You're offline. Changes can't be saved until you reconnect.")).toBeVisible();
      await rec.pause(1500);
      await context.setOffline(false);
    },
  }),
};

