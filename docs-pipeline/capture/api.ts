import { expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext } from "@playwright/test";
import { sessionStorageState } from "../../e2e/session";
import type { E2EUser } from "../../e2e/env";

const CREATE_FIELDS = ["projectId", "title", "priority", "status", "dueAt", "startAt", "deadlineAt", "parentTaskId"];

export type Workspace = { id: string; name: string };
export type Project = { id: string; name: string };
export type Task = { id: string; title: string };
export type Team = { workspace: Workspace; project: Project; url: string };

async function json<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.url()} → ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

/** A local calendar day `offset` days from today, as the API's date-only form. */
export function day(offset: number) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Today (plus `offset` days) at a local hour, as an instant. */
export function at(hour: number, offset = 0, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/**
 * Seeds data through the real API as a signed-in test user, so the recording
 * starts on a realistic workspace instead of an empty one. Everything it
 * creates is removed by `cleanup()`.
 */
export class Api {
  private readonly teams: string[] = [];
  private readonly others: BrowserContext[] = [];
  private readonly afterwards: Array<() => Promise<unknown>> = [];

  constructor(readonly request: APIRequestContext, private readonly browser: Browser) {}

  get = (url: string) => this.request.get(url);
  post = <T = unknown>(url: string, data?: object) => this.request.post(url, { data }).then((r) => json<T>(r));
  patch = <T = unknown>(url: string, data: object) => this.request.patch(url, { data }).then((r) => json<T>(r));

  async me(): Promise<{ id: string; displayName: string }> {
    return (await json<{ user: { id: string; displayName: string } }>(await this.request.get("/api/me"))).user;
  }

  async personal(): Promise<Workspace> {
    const { workspaces } = await json<{ workspaces: Array<Workspace & { kind: string }> }>(await this.request.get("/api/workspaces"));
    return workspaces.find((w) => w.kind === "personal")!;
  }

  /** A team workspace with its seeded General project (renamed when `projectName` is given). */
  async team(name: string, projectName?: string): Promise<Team> {
    const { workspace } = await this.post<{ workspace: Workspace }>("/api/workspaces", { name });
    this.teams.push(workspace.id);
    const { projects } = await json<{ projects: Project[] }>(await this.request.get(`/api/workspaces/${workspace.id}`));
    let project = projects[0]!;
    if (projectName) project = (await this.patch<{ project: Project }>(`/api/projects/${project.id}`, { name: projectName })).project;
    return { workspace, project, url: `/w/${workspace.id}/p/${project.id}` };
  }

  /** Tracks a workspace the recording created in the UI, so cleanup removes it. */
  async adopt(name: string) {
    const { workspaces } = await json<{ workspaces: Workspace[] }>(await this.request.get("/api/workspaces"));
    const found = workspaces.find((w) => w.name === name);
    if (found) this.teams.push(found.id);
  }

  async project(workspaceId: string, name: string, extra: object = {}): Promise<Project> {
    return (await this.post<{ project: Project }>(`/api/workspaces/${workspaceId}/projects`, { name, ...extra })).project;
  }

  async task(workspaceId: string, data: Record<string, unknown>): Promise<Task> {
    const { task } = await this.post<{ task: Task }>(`/api/workspaces/${workspaceId}/tasks`, data);
    // Fields the create call doesn't take go on in a follow-up update.
    const rest = Object.fromEntries(Object.entries(data).filter(([key]) => !CREATE_FIELDS.includes(key)));
    if (Object.keys(rest).length) await this.patch(`/api/tasks/${task.id}`, rest);
    return task;
  }

  async tag(workspaceId: string, name: string, color?: string): Promise<{ id: string; name: string }> {
    return (await this.post<{ tag: { id: string; name: string } }>(`/api/workspaces/${workspaceId}/tags`, { name, ...(color ? { color } : {}) })).tag;
  }

  async section(projectId: string, name: string): Promise<{ id: string; name: string }> {
    return (await this.post<{ section: { id: string; name: string } }>(`/api/projects/${projectId}/sections`, { name })).section;
  }

  /** Signs another test user in (off camera) and adds them to the team with a role. */
  async join(team: Team, user: E2EUser, role: "admin" | "member" | "viewer" = "member"): Promise<APIRequestContext> {
    const context = await this.browser.newContext({ storageState: await sessionStorageState(user), extraHTTPHeaders: { "X-Noirly-CSRF": "1" } });
    this.others.push(context);
    const { invite } = await this.post<{ invite: { token: string } }>(`/api/workspaces/${team.workspace.id}/invites`, { role });
    expect((await context.request.post("/api/invites/accept", { data: { token: invite.token } })).ok()).toBe(true);
    return context.request;
  }

  /** A signed-in request context for another user, without joining anything. */
  async as(user: E2EUser): Promise<APIRequestContext> {
    const context = await this.browser.newContext({ storageState: await sessionStorageState(user), extraHTTPHeaders: { "X-Noirly-CSRF": "1" } });
    this.others.push(context);
    return context.request;
  }

  /** A sample team with a realistic project, used by most recordings. */
  async sampleTeam(name = "Northwind Studio", projectName = "Website Relaunch") {
    const team = await this.team(name, projectName);
    const ws = team.workspace.id;
    const pid = team.project.id;
    const design = await this.tag(ws, "design");
    const copy = await this.tag(ws, "copy");
    const tasks = {
      brief: await this.task(ws, { title: "Write the creative brief", projectId: pid, priority: "high", dueAt: day(0), status: "in_progress", tagIds: [copy.id] }),
      moodboard: await this.task(ws, { title: "Collect moodboard references", projectId: pid, priority: "medium", dueAt: day(1), tagIds: [design.id] }),
      sitemap: await this.task(ws, { title: "Draft the sitemap", projectId: pid, priority: "medium", dueAt: day(2) }),
      homepage: await this.task(ws, { title: "Design the homepage", projectId: pid, priority: "high", startAt: day(2), dueAt: day(6), tagIds: [design.id] }),
      copydeck: await this.task(ws, { title: "Homepage copy deck", projectId: pid, priority: "low", dueAt: day(4), tagIds: [copy.id] }),
      analytics: await this.task(ws, { title: "Set up analytics", projectId: pid, status: "done" }),
      hosting: await this.task(ws, { title: "Choose a hosting plan", projectId: pid }),
    };
    return { team, ws, pid, tags: { design, copy }, tasks };
  }

  /** Runs at cleanup, before other users' sessions close (e.g. deleting what they made). */
  onCleanup(step: () => Promise<unknown>) {
    this.afterwards.push(step);
  }

  async cleanup() {
    for (const step of this.afterwards) await step().catch(() => {});
    for (const context of this.others) await context.close().catch(() => {});
    for (const id of this.teams) await this.request.delete(`/api/workspaces/${id}`).catch(() => {});
  }
}
