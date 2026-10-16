import type {
  ActivityEvent,
  AppNotification,
  BoardColumn,
  BoardStatus,
  ChatMessage,
  Comment,
  CommentMention,
  Project,
  Tag,
  Task,
  TaskAttachment,
  TrashedTask,
  Workspace,
} from "@/src/core/sync/types";
import type { MemberRole } from "@/src/core/models/enums";
import type { SpaceLinkStatus } from "@/src/server/spaces/link";
import type { SpaceSyncResult } from "@/src/server/spaces/sync";

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
      // FormData sets its own multipart Content-Type (with the boundary).
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      "X-Noirly-CSRF": "1",
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
          taskSaveMode?: "auto" | "manual";
          displayName: string | null;
          title: string | null;
          timezone: string | null;
          bio: string | null;
        };
      };
    }>("/api/me");
  },
  updateMe(profile: {
    taskSaveMode?: "auto" | "manual";
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
          taskSaveMode?: "auto" | "manual";
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
  calendarFeed() {
    return request<{ enabled: boolean; createdAt: string | null }>("/api/me/calendar-feed");
  },
  createCalendarFeed() {
    return request<{ enabled: true; createdAt: string; url: string }>("/api/me/calendar-feed", { method: "POST" });
  },
  disableCalendarFeed() {
    return request<{ enabled: false; createdAt: null }>("/api/me/calendar-feed", { method: "DELETE" });
  },
  listNotifications() {
    return request<{ items: AppNotification[]; unread: number }>("/api/notifications");
  },
  markNotificationsRead(ids?: string[]) {
    return request<{ ok: boolean }>("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify(ids ? { ids } : {}),
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
  updateWorkspace(workspaceId: string, name: string) {
    return request<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },
  deleteWorkspace(workspaceId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}`, {
      method: "DELETE",
    });
  },
  spaceStatus(workspaceId: string) {
    return request<SpaceLinkStatus>(`/api/workspaces/${workspaceId}/space`);
  },
  linkSpace(workspaceId: string, spaceId: string) {
    return request<{ result: SpaceSyncResult }>(`/api/workspaces/${workspaceId}/space`, {
      method: "POST",
      body: JSON.stringify({ action: "link", spaceId }),
    });
  },
  createSpaceFromWorkspace(workspaceId: string, name?: string) {
    return request<{ result: SpaceSyncResult; spaceId: string; dropped: number }>(
      `/api/workspaces/${workspaceId}/space`,
      { method: "POST", body: JSON.stringify({ action: "create", name }) },
    );
  },
  syncSpace(workspaceId: string) {
    return request<{ result: SpaceSyncResult }>(`/api/workspaces/${workspaceId}/space`, {
      method: "POST",
      body: JSON.stringify({ action: "sync" }),
    });
  },
  unlinkSpace(workspaceId: string) {
    return request<{ ok: boolean }>(`/api/workspaces/${workspaceId}/space`, { method: "DELETE" });
  },
  listMembers(workspaceId: string) {
    return request<{
      members: Array<{
        userId: string;
        email: string;
        displayName: string;
        role: MemberRole;
        isCreator: boolean;
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
  emailInvite(workspaceId: string, email: string, role: Exclude<MemberRole, "owner">) {
    return request<{
      invite: { role: string; email: string; expiresAt: string; emailed: true };
    }>(`/api/workspaces/${workspaceId}/invites`, {
      method: "POST",
      body: JSON.stringify({ role, email }),
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
  createColumn(projectId: string, body: { name: string; statusMapped: BoardStatus }) {
    return request<{ columns: BoardColumn[] }>(`/api/projects/${projectId}/columns`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  reorderColumns(projectId: string, columnIds: string[]) {
    return request<{ columns: BoardColumn[] }>(`/api/projects/${projectId}/columns`, {
      method: "PATCH",
      body: JSON.stringify({ columnIds }),
    });
  },
  updateColumn(columnId: string, patch: { name?: string; statusMapped?: BoardStatus }) {
    return request<{ columns: BoardColumn[] }>(`/api/columns/${columnId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  deleteColumn(columnId: string) {
    return request<{ columns: BoardColumn[] }>(`/api/columns/${columnId}`, {
      method: "DELETE",
    });
  },
  listAttachments(taskId: string) {
    return request<{ attachments: TaskAttachment[] }>(`/api/tasks/${taskId}/attachments`);
  },
  uploadAttachment(taskId: string, file: File) {
    return (async () => {
      const prepared = await request<{ upload: { mode: "proxy" } | { mode: "direct"; key: string; uploadUrl: string; contentType: string } }>(
        `/api/tasks/${taskId}/attachments/upload-url`,
        { method: "POST", body: JSON.stringify({ name: file.name, type: file.type, size: file.size }) },
      );
      if (prepared.upload.mode === "proxy") {
        const form = new FormData();
        form.append("file", file);
        return request<{ attachment: TaskAttachment }>(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form });
      }
      const response = await fetch(prepared.upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": prepared.upload.contentType },
        body: file,
        credentials: "omit",
      });
      if (!response.ok) throw new ApiRequestError(response.status, "Direct R2 upload failed. Try again.");
      return request<{ attachment: TaskAttachment }>(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        body: JSON.stringify({ key: prepared.upload.key, name: file.name }),
      });
    })();
  },
  deleteAttachment(attachmentId: string) {
    return request<{ ok: boolean }>(`/api/attachments/${attachmentId}`, { method: "DELETE" });
  },
  listChatMessages(projectId: string, before?: string) {
    const query = before ? `?before=${encodeURIComponent(before)}` : "";
    return request<{ messages: ChatMessage[]; hasMore: boolean }>(
      `/api/projects/${projectId}/messages${query}`,
    );
  },
  sendChatMessage(projectId: string, body: string) {
    return request<{ message: ChatMessage }>(`/api/projects/${projectId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  },
  deleteChatMessage(projectId: string, messageId: string) {
    return request<{ ok: boolean }>(`/api/projects/${projectId}/messages/${messageId}`, {
      method: "DELETE",
    });
  },
  updateProject(
    projectId: string,
    patch: { name?: string; description?: string | null },
  ) {
    return request<{ project: Project }>(`/api/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  deleteProject(projectId: string) {
    return request<{ ok: boolean }>(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
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
      description?: string | null;
      assigneeIds?: string[];
      projectId?: string | null;
      parentTaskId?: string | null;
      status?: Task["status"];
      priority?: Task["priority"];
      dueAt?: string | null;
      dueHasTime?: boolean;
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
  listTrash(workspaceId: string) {
    return request<{ items: TrashedTask[] }>(`/api/workspaces/${workspaceId}/trash`);
  },
  restoreTask(taskId: string) {
    return request<{ task: Task }>(`/api/tasks/${taskId}/restore`, {
      method: "POST",
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
  createComment(taskId: string, body: string, mentions: CommentMention[] = []) {
    return request<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body, mentions }),
    });
  },
  updateComment(commentId: string, body: string, mentions: CommentMention[] = []) {
    return request<{ comment: Comment }>(`/api/comments/${commentId}`, {
      method: "PATCH",
      body: JSON.stringify({ body, mentions }),
    });
  },
  deleteComment(commentId: string) {
    return request<{ ok: boolean }>(`/api/comments/${commentId}`, {
      method: "DELETE",
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
