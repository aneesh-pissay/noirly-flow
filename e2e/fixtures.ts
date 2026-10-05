import { test as base, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { storageStatePath, type E2EUser } from "./env";

export type Workspace = { id: string; name: string };
export type Project = { id: string; name: string };
export type Team = { workspace: Workspace; project: Project; url: string };

/** Short unique suffix so parallel tests never collide on names. */
export const uid = () => Math.random().toString(36).slice(2, 8);

async function json<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  expect(response.ok(), `${response.url()} → ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

/**
 * A team workspace of its own for one test — isolation for parallel runs.
 * Created through the API (as the UI does), with its seeded "General" project.
 */
export async function createTeam(request: APIRequestContext, name = `Team ${uid()}`): Promise<Team> {
  const { workspace } = await json<{ workspace: Workspace }>(
    await request.post("/api/workspaces", { data: { name } }),
  );
  const { projects } = await json<{ projects: Project[] }>(
    await request.get(`/api/workspaces/${workspace.id}`),
  );
  const project = projects[0]!;
  return { workspace, project, url: `/w/${workspace.id}/p/${project.id}` };
}

export async function createTask(
  request: APIRequestContext,
  workspaceId: string,
  data: { title: string; projectId?: string | null; priority?: string; status?: string; dueAt?: string | null },
) {
  return (
    await json<{ task: { id: string; title: string } }>(
      await request.post(`/api/workspaces/${workspaceId}/tasks`, { data }),
    )
  ).task;
}

/** A second, independently signed-in browser for multi-user tests. */
export async function pageAs(browser: Browser, user: E2EUser): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStatePath(user) });
  return context.newPage();
}

type Fixtures = {
  /** A fresh team workspace owned by the signed-in owner. */
  team: Team;
};

/** Tests run signed in as the owner unless they opt out with `test.use`. */
export const test = base.extend<Fixtures>({
  storageState: storageStatePath("owner"),
  // `provide` is Playwright's fixture callback (usually named `use`, which the React hooks lint rule misreads).
  team: async ({ page }, provide) => {
    await provide(await createTeam(page.request));
  },
});

export { expect };

/** The task row in list view whose title button matches. */
export function taskRow(page: Page, title: string) {
  return page.locator("li", { has: page.getByRole("button", { name: title, exact: true }) });
}

/** Waits for the in-page task list to finish its first load. */
export async function waitForTasks(page: Page) {
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  await expect(page.getByText("Loading tasks…")).toBeHidden();
}

/** Opens a project page in list view (projects default to the board). */
export async function openList(page: Page, url: string) {
  await page.goto(url);
  await waitForTasks(page);
  await page.getByRole("button", { name: "List", exact: true }).click();
}
