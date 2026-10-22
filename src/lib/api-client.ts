import { dueRange, type DuePreset } from "@/src/features/task/dates";
import { noteResponse, setOffline } from "@/src/lib/offline";
import type { Template } from "@/src/core/templates";
import type { TimeEntryView } from "@/src/core/time-tracking";
import type { Occurrence } from "@/src/core/habits";
import type { CompletedRow, OpenRow, TimeRow } from "@/src/core/stats";
import type { Goal } from "@/src/core/goals";
import type { Approval } from "@/src/core/approvals";
import type { AccessTokenView, TokenScope } from "@/src/core/access-tokens";
import type { DeliveryView, WebhookEventType, WebhookView } from "@/src/core/webhooks";
import type { IntakeForm, QuestionKind } from "@/src/core/forms";
import type { BackupSettings, BackupView } from "@/src/server/backups";
import type { ImportResult } from "@/src/server/import";
import type { ImportTask } from "@/src/core/import";
import type { AutomationAction, AutomationCondition, AutomationRule, AutomationTrigger } from "@/src/core/automations";
import type { FieldType, ProjectField } from "@/src/core/custom-fields";
import type { PendingInvite } from "@/src/server/workspace/members";
import type {
  ActivityEvent,
  AppNotification,
  BoardColumn,
  BoardStatus,
  ChatMessage,
  Comment,
  CommentMention,
  Project,
  SavedFilter,
  Section,
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
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        // FormData sets its own multipart Content-Type (with the boundary).
        ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        "X-Noirly-CSRF": "1",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    // No answer at all: the network is down (writes are never queued offline).
    setOffline(true);
    throw new ApiRequestError(0, "You're offline. Changes can't be saved until you reconnect.");
  }
  noteResponse(response);

  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ApiRequestError(response.status, data.message || data.error || "Request failed");
  }
  return data;
}

/** What the form builder sends. */
export type FormBody = Pick<IntakeForm, "name" | "intro" | "titleLabel" | "askDetails" | "defaults" | "confirmation" | "enabled"> & {
  questions: Array<{ id?: string; label: string; kind: QuestionKind; required: boolean; options: string[] }>;
};

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
        /** Minutes available per weekday, Sunday first. */
        capacityMinutes: number[];
      }>;
    }>(`/api/workspaces/${workspaceId}/members`);
  },
  setMemberCapacity(workspaceId: string, userId: string, minutes: number[]) {
    return request<{ capacityMinutes: number[] }>(`/api/workspaces/${workspaceId}/members/${userId}/capacity`, {
      method: "PUT",
      body: JSON.stringify({ minutes }),
    });
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
      invite: { id: string; token: string; url: string; role: string; expiresAt: string };
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
  listInvites(workspaceId: string) {
    return request<{ invites: PendingInvite[] }>(`/api/workspaces/${workspaceId}/invites`);
  },
  revokeInvite(inviteId: string) {
    return request<{ ok: boolean }>(`/api/invites/${inviteId}`, { method: "DELETE" });
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
    patch: { name?: string; description?: string | null; color?: string | null; archived?: boolean; defaultView?: Project["defaultView"] },
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
      /** ISO instants; when set they replace `due`. */
      dueAfter?: string;
      dueBefore?: string;
      /** Only tasks with this tag. */
      tag?: string;
      /** Only tasks completed at or after this instant. */
      completedAfter?: string;
      /** Only tasks linked to this goal. */
      goal?: string;
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
    // Ranges are worked out here, in the user's zone; the server would use its own (UTC).
    const range = query.dueAfter || query.dueBefore
      ? { dueAfter: query.dueAfter, dueBefore: query.dueBefore }
      : query.due && query.due !== "none" ? dueRange(query.due as DuePreset) : {};
    if (range.dueAfter) params.set("dueAfter", range.dueAfter);
    if (range.dueBefore) params.set("dueBefore", range.dueBefore);
    if (query.due === "none") params.set("due", "none");
    if (query.tag) params.set("tag", query.tag);
    if (query.completedAfter) params.set("completedAfter", query.completedAfter);
    if (query.goal) params.set("goal", query.goal);
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
      goalId?: string | null;
      milestoneId?: string | null;
      status?: Task["status"];
      priority?: Task["priority"];
      dueAt?: string | null;
      dueHasTime?: boolean;
      startAt?: string | null;
      deadlineAt?: string | null;
      durationMinutes?: number | null;
      reminderMinutes?: number | null;
      recurrence?: Task["recurrence"];
      tagIds?: string[];
      sectionId?: string | null;
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
  /** The caller's own starred projects, across workspaces. */
  listFavoriteProjects() {
    return request<{ projectIds: string[] }>("/api/me/favorite-projects");
  },
  setFavoriteProject(projectId: string, favorite: boolean) {
    return request<{ projectIds: string[] }>("/api/me/favorite-projects", {
      method: "PUT",
      body: JSON.stringify({ projectId, favorite }),
    });
  },
  requestApproval(taskId: string, approverId: string) {
    return request<{ approval: Approval | null }>(`/api/tasks/${taskId}/approval`, { method: "POST", body: JSON.stringify({ approverId }) });
  },
  decideApproval(taskId: string, decision: "approve" | "reject", note?: string) {
    return request<{ approval: Approval | null }>(`/api/tasks/${taskId}/approval/decision`, { method: "POST", body: JSON.stringify({ decision, note: note || null }) });
  },
  withdrawApproval(taskId: string) {
    return request<{ approval: null }>(`/api/tasks/${taskId}/approval`, { method: "DELETE" });
  },
  listGoals(workspaceId: string) {
    return request<{ goals: Goal[] }>(`/api/workspaces/${workspaceId}/goals`);
  },
  getGoal(goalId: string) {
    return request<{ goal: Goal }>(`/api/goals/${goalId}`);
  },
  createGoal(workspaceId: string, input: { name: string; description?: string | null; targetAt?: string | null }) {
    return request<{ goal: Goal }>(`/api/workspaces/${workspaceId}/goals`, { method: "POST", body: JSON.stringify(input) });
  },
  updateGoal(goalId: string, patch: { name?: string; description?: string | null; targetAt?: string | null; archived?: boolean }) {
    return request<{ goal: Goal }>(`/api/goals/${goalId}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  deleteGoal(goalId: string) {
    return request<{ ok: boolean }>(`/api/goals/${goalId}`, { method: "DELETE" });
  },
  addMilestone(goalId: string, input: { name: string; dueAt?: string | null }) {
    return request<{ goal: Goal }>(`/api/goals/${goalId}/milestones`, { method: "POST", body: JSON.stringify(input) });
  },
  updateMilestone(goalId: string, milestoneId: string, patch: { name?: string; dueAt?: string | null }) {
    return request<{ goal: Goal }>(`/api/goals/${goalId}/milestones/${milestoneId}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  deleteMilestone(goalId: string, milestoneId: string) {
    return request<{ goal: Goal }>(`/api/goals/${goalId}/milestones/${milestoneId}`, { method: "DELETE" });
  },
  customizeWorkspace(workspaceId: string, patch: { icon?: string | null; color?: string | null; defaultView?: Workspace["defaultView"]; statusNames?: Partial<Workspace["statusNames"]> }) {
    return request<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}/customization`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  importTasks(projectId: string, tasks: ImportTask[]) {
    return request<ImportResult>(`/api/projects/${projectId}/import`, { method: "POST", body: JSON.stringify({ tasks }) });
  },
  backupSettings(workspaceId: string) {
    return request<BackupSettings>(`/api/workspaces/${workspaceId}/backups`);
  },
  setBackupSchedule(workspaceId: string, input: { enabled: boolean; frequency: "daily" | "weekly" }) {
    return request<BackupSettings>(`/api/workspaces/${workspaceId}/backups`, { method: "PUT", body: JSON.stringify(input) });
  },
  backUpNow(workspaceId: string) {
    return request<{ backup: BackupView }>(`/api/workspaces/${workspaceId}/backups/run`, { method: "POST" });
  },
  listForms(projectId: string) {
    return request<{ forms: IntakeForm[] }>(`/api/projects/${projectId}/forms`);
  },
  createForm(projectId: string, input: FormBody) {
    return request<{ form: IntakeForm }>(`/api/projects/${projectId}/forms`, { method: "POST", body: JSON.stringify(input) });
  },
  updateForm(formId: string, patch: Partial<FormBody>) {
    return request<{ form: IntakeForm }>(`/api/forms/${formId}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  deleteForm(formId: string) {
    return request<{ ok: boolean }>(`/api/forms/${formId}`, { method: "DELETE" });
  },
  listWebhooks(workspaceId: string) {
    return request<{ webhooks: WebhookView[] }>(`/api/workspaces/${workspaceId}/webhooks`);
  },
  createWebhook(workspaceId: string, input: { url: string; events: WebhookEventType[] }) {
    return request<{ webhook: WebhookView; secret: string }>(`/api/workspaces/${workspaceId}/webhooks`, { method: "POST", body: JSON.stringify(input) });
  },
  updateWebhook(webhookId: string, patch: { url?: string; events?: WebhookEventType[]; enabled?: boolean }) {
    return request<{ webhook: WebhookView }>(`/api/webhooks/${webhookId}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  deleteWebhook(webhookId: string) {
    return request<{ ok: boolean }>(`/api/webhooks/${webhookId}`, { method: "DELETE" });
  },
  rotateWebhookSecret(webhookId: string) {
    return request<{ secret: string }>(`/api/webhooks/${webhookId}/secret`, { method: "POST" });
  },
  testWebhook(webhookId: string) {
    return request<{ delivery: DeliveryView }>(`/api/webhooks/${webhookId}/test`, { method: "POST" });
  },
  listWebhookDeliveries(webhookId: string) {
    return request<{ deliveries: DeliveryView[] }>(`/api/webhooks/${webhookId}/deliveries`);
  },
  redeliverWebhook(webhookId: string, deliveryId: string) {
    return request<{ delivery: DeliveryView }>(`/api/webhooks/${webhookId}/deliveries/${deliveryId}/redeliver`, { method: "POST" });
  },
  listAccessTokens() {
    return request<{ tokens: AccessTokenView[] }>("/api/me/tokens");
  },
  createAccessToken(input: { name: string; scope: TokenScope; days: number }) {
    return request<{ token: string; accessToken: AccessTokenView }>("/api/me/tokens", { method: "POST", body: JSON.stringify(input) });
  },
  revokeAccessToken(tokenId: string) {
    return request<{ ok: boolean }>(`/api/me/tokens/${tokenId}`, { method: "DELETE" });
  },
  listAutomations(projectId: string) {
    return request<{ rules: AutomationRule[] }>(`/api/projects/${projectId}/automations`);
  },
  createAutomation(projectId: string, input: { name: string; trigger: AutomationTrigger; conditions: AutomationCondition[]; actions: AutomationAction[]; timeZone?: string }) {
    return request<{ rule: AutomationRule }>(`/api/projects/${projectId}/automations`, { method: "POST", body: JSON.stringify(input) });
  },
  updateAutomation(ruleId: string, patch: { name?: string; enabled?: boolean }) {
    return request<{ rule: AutomationRule }>(`/api/automations/${ruleId}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  deleteAutomation(ruleId: string) {
    return request<{ ok: boolean }>(`/api/automations/${ruleId}`, { method: "DELETE" });
  },
  listFields(projectId: string) {
    return request<{ fields: ProjectField[] }>(`/api/projects/${projectId}/fields`);
  },
  createField(projectId: string, input: { name: string; type: FieldType; options?: Array<{ name: string }> }) {
    return request<{ field: ProjectField }>(`/api/projects/${projectId}/fields`, { method: "POST", body: JSON.stringify(input) });
  },
  updateField(fieldId: string, patch: { name?: string; position?: number; options?: Array<{ id?: string; name: string }> }) {
    return request<{ field: ProjectField }>(`/api/fields/${fieldId}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  deleteField(fieldId: string) {
    return request<{ ok: boolean }>(`/api/fields/${fieldId}`, { method: "DELETE" });
  },
  listSections(projectId: string) {
    return request<{ sections: Section[] }>(`/api/projects/${projectId}/sections`);
  },
  createSection(projectId: string, name: string) {
    return request<{ section: Section }>(`/api/projects/${projectId}/sections`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  },
  updateSection(sectionId: string, patch: { name?: string; position?: number }) {
    return request<{ section: Section }>(`/api/sections/${sectionId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  deleteSection(sectionId: string) {
    return request<{ ok: boolean }>(`/api/sections/${sectionId}`, { method: "DELETE" });
  },
  /** Up to 100 tasks at once; tasks that couldn't be changed come back in `failed`. */
  bulkTasks(
    workspaceId: string,
    body: { taskIds: string[]; patch?: Partial<Pick<Task, "status" | "priority" | "dueAt" | "dueHasTime" | "projectId" | "assigneeIds">>; delete?: true },
  ) {
    return request<{ tasks: Task[]; failed: Array<{ id: string; message: string }> }>(
      `/api/workspaces/${workspaceId}/tasks/bulk`,
      { method: "POST", body: JSON.stringify(body) },
    );
  },
  listTemplates(workspaceId: string) {
    return request<{ templates: Template[] }>(`/api/workspaces/${workspaceId}/templates`);
  },
  saveTemplate(workspaceId: string, body: { kind: "task"; taskId: string; name: string } | { kind: "project"; projectId: string; name: string }) {
    return request<{ template: Template }>(`/api/workspaces/${workspaceId}/templates`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  deleteTemplate(templateId: string) {
    return request<{ ok: boolean }>(`/api/templates/${templateId}`, { method: "DELETE" });
  },
  applyTaskTemplate(templateId: string, body: { projectId: string | null; sectionId?: string | null; overrides?: Partial<Pick<Task, "title" | "description" | "priority" | "dueAt" | "dueHasTime" | "assigneeIds">> }) {
    return request<{ task: Task }>(`/api/templates/${templateId}/apply`, {
      method: "POST",
      body: JSON.stringify({ kind: "task", ...body }),
    });
  },
  applyProjectTemplate(templateId: string, name: string) {
    return request<{ project: Project }>(`/api/templates/${templateId}/apply`, {
      method: "POST",
      body: JSON.stringify({ kind: "project", name }),
    });
  },
  /** Tasks waiting on this one. */
  listBlocking(taskId: string) {
    return request<{ tasks: Array<{ id: string; title: string; status: Task["status"] }> }>(`/api/tasks/${taskId}/blocking`);
  },
  listTaskTime(taskId: string) {
    return request<{ entries: TimeEntryView[]; totalMinutes: number }>(`/api/tasks/${taskId}/time`);
  },
  addTime(taskId: string, body: { minutes: number; note?: string | null }) {
    return request<{ entry: TimeEntryView }>(`/api/tasks/${taskId}/time`, { method: "POST", body: JSON.stringify(body) });
  },
  startTimer(taskId: string) {
    return request<{ entry: TimeEntryView }>(`/api/tasks/${taskId}/time/start`, { method: "POST" });
  },
  stopTimer() {
    return request<{ entry: TimeEntryView | null }>("/api/me/time/stop", { method: "POST" });
  },
  runningTimer() {
    return request<{ running: { entry: TimeEntryView; taskTitle: string; workspaceId: string } | null }>("/api/me/time");
  },
  deleteTimeEntry(entryId: string) {
    return request<{ ok: boolean }>(`/api/time/${entryId}`, { method: "DELETE" });
  },
  listHabits(workspaceId: string) {
    return request<{ habits: Array<{ seriesId: string; task: Task; occurrences: Occurrence[] }> }>(`/api/workspaces/${workspaceId}/habits`);
  },
  myStats(workspaceId: string, since: string) {
    return request<{ completed: CompletedRow[]; open: OpenRow[]; time: TimeRow[] }>(
      `/api/workspaces/${workspaceId}/stats?since=${encodeURIComponent(since)}`,
    );
  },
  listFilters(workspaceId: string) {
    return request<{ filters: SavedFilter[] }>(`/api/workspaces/${workspaceId}/filters`);
  },
  createFilter(workspaceId: string, input: { name: string; query: string }) {
    return request<{ filter: SavedFilter }>(`/api/workspaces/${workspaceId}/filters`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  updateFilter(filterId: string, patch: { name?: string; query?: string }) {
    return request<{ filter: SavedFilter }>(`/api/filters/${filterId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  deleteFilter(filterId: string) {
    return request<{ ok: boolean }>(`/api/filters/${filterId}`, { method: "DELETE" });
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
  updateTag(tagId: string, patch: { name?: string; color?: string }) {
    return request<{ tag: Tag }>(`/api/tags/${tagId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
  deleteTag(tagId: string) {
    return request<{ ok: boolean }>(`/api/tags/${tagId}`, { method: "DELETE" });
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
