import type {
  ActivityEvent,
  BoardColumn,
  Comment,
  Project,
  Tag,
  Task,
  Workspace,
} from "@/src/core/sync/types";
import type { MemberRole } from "@/src/core/models/enums";

type ApiErrorBody = { error?: string; message?: string };

/** A non-2xx API response; `status` lets callers tell 4xx from network errors. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ApiRequestError(response.status, data.message || data.error || "Request failed");
  }
  return data;
}

export const api = {
  me() {
    return request<{
      user: {
        id: string;
        email: string;
        displayName: string;
        identityName: string;
        profile: {
          displayName: string | null;
          title: string | null;
          timezone: string | null;
          bio: string | null;
        };
      };
    }>("/api/me");
  },
  updateMe(profile: {
    displayName?: string | null;
    title?: string | null;
    timezone?: string | null;
    bio?: string | null;
  }) {
    return request<{
      user: {
        id: string;
        email: string;
        displayName: string;
        identityName: string;
        profile: {
          displayName: string | null;
          title: string | null;
          timezone: string | null;
          bio: string | null;
        };
      };
    }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ profile }),
    });
  },
  listWorkspaces() {
    return request<{ workspaces: Workspace[] }>("/api/workspaces");
  },
  createWorkspace(name: string) {
    return request<{ workspace: Workspace }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  listMembers(workspaceId: string) {
    return request<{
      members: Array<{
        userId: string;
        email: string;
        displayName: string;
        role: MemberRole;
      }>;
    }>(`/api/workspaces/${workspaceId}/members`);
  },
  updateMember(workspaceId: string, userId: string, role: MemberRole) {
    return request<{ member: { userId: string; role: MemberRole } }>(
      `/api/workspaces/${workspaceId}/members/${userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      },
    );
  },
  removeMember(workspaceId: string, userId: string) {
    return request<{ ok: boolean }>(
      `/api/workspaces/${workspaceId}/members/${userId}`,
      { method: "DELETE" },
    );
  },
  createInvite(workspaceId: string, role: Exclude<MemberRole, "owner">) {
    return request<{
      invite: { token: string; url: string; role: string; expiresAt: string };
    }>(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      body: JSON.stringify({ role }),
    });
  },
  acceptInvite(token: string) {
    return request<{ workspaceId: string; name: string }>("/api/invites/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },
  getWorkspace(workspaceId: string) {
    return request<{
      workspace: Workspace & { role: MemberRole };
      projects: Project[];
    }>(`/api/workspaces/${workspaceId}`);
  },
  getProject(projectId: string) {
    return request<{
      project: Project & { columns: BoardColumn[] };
    }>(`/api/projects/${projectId}`);
  },
  listProjects(workspaceId: string) {
    return request<{ projects: Project[] }>(
      `/api/workspaces/${workspaceId}/projects`,
    );
  },
  createProject(
    workspaceId: string,
    body: { name: string; description?: string | null },
  ) {
    return request<{ project: Project }>(
      `/api/workspaces/${workspaceId}/projects`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  },
  listTasks(
    workspaceId: string,
    query: {
      projectId?: string;
      inbox?: boolean | string;
      root?: boolean | string;
      parentTaskId?: string;
      assigneeId?: string;
      status?: string;
      priority?: string;
      search?: string;
      due?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    if (query.inbox === true || query.inbox === "1" || query.inbox === "true") {
      params.set("inbox", "1");
    } else if (query.projectId) {
      params.set("projectId", query.projectId);
    }
    if (query.root === true || query.root === "1" || query.root === "true") {
      params.set("root", "1");
    } else if (query.parentTaskId) {
      params.set("parentTaskId", query.parentTaskId);
    }
    if (query.assigneeId) params.set("assigneeId", query.assigneeId);
    if (query.status) params.set("status", query.status);
    if (query.priority) params.set("priority", query.priority);
    if (query.search) params.set("search", query.search);
    if (query.due) params.set("due", query.due);
    const qs = params.toString();
    return request<{ tasks: Task[] }>(
      `/api/workspaces/${workspaceId}/tasks${qs ? `?${qs}` : ""}`,
    );
  },
  createTask(
    workspaceId: string,
    body: {
      title: string;
      projectId?: string | null;
      parentTaskId?: string | null;
      status?: Task["status"];
      priority?: Task["priority"];
      dueAt?: string | null;
    },
  ) {
    return request<{ task: Task }>(`/api/workspaces/${workspaceId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  getTask(taskId: string) {
    return request<{ task: Task }>(`/api/tasks/${taskId}`);
  },
  updateTask(taskId: string, patch: Partial<Task>) {
    return request<{ task: Task }>(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  deleteTask(taskId: string) {
    return request<{ ok: boolean }>(`/api/tasks/${taskId}`, {
      method: "DELETE",
    });
  },
  search(q: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    return request<{
      workspaces: Workspace[];
      tasks: Task[];
    }>(`/api/search?${params.toString()}`);
  },
  listTags(workspaceId: string) {
    return request<{ tags: Tag[] }>(`/api/workspaces/${workspaceId}/tags`);
  },
  createTag(workspaceId: string, body: { name: string; color?: string }) {
    return request<{ tag: Tag }>(`/api/workspaces/${workspaceId}/tags`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  reorderTasks(
    projectId: string,
    moves: Array<{
      taskId: string;
      columnId: string | null;
      position: number;
      status?: Task["status"];
    }>,
  ) {
    return request<{ tasks: Task[] }>(`/api/projects/${projectId}/reorder`, {
      method: "POST",
      body: JSON.stringify({ moves }),
    });
  },
  listComments(taskId: string) {
    return request<{ comments: Comment[] }>(`/api/tasks/${taskId}/comments`);
  },
  createComment(taskId: string, body: string) {
    return request<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },
  listActivity(workspaceId: string, query: { taskId?: string; cursor?: string } = {}) {
    const params = new URLSearchParams();
    if (query.taskId) params.set("taskId", query.taskId);
    if (query.cursor) params.set("cursor", query.cursor);
    const qs = params.toString();
    return request<{ items: ActivityEvent[]; nextCursor?: string }>(
      `/api/workspaces/${workspaceId}/activity${qs ? `?${qs}` : ""}`,
    );
  },
  async exportActivityCsv(workspaceId: string) {
    const response = await fetch(`/api/workspaces/${workspaceId}/activity/export`);
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as ApiErrorBody;
      throw new ApiRequestError(response.status, data.message || data.error || "Export failed");
    }
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? null;
    return { blob: await response.blob(), filename };
  },
};
