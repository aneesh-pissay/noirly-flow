import type {
  COLUMN_STATUSES,
  MemberRole,
  ProjectView,
  RecurrenceFrequency,
  TaskPriority,
  TaskStatus,
  WorkspaceKind,
} from "@/src/core/models/enums";

export type Workspace = {
  id: string;
  kind: WorkspaceKind;
  name: string;
  slug: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  color: string | null;
  defaultView: ProjectView;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

/** Statuses a board column can stand for; canceled tasks stay off the board. */
export type BoardStatus = (typeof COLUMN_STATUSES)[number];

export type BoardColumn = {
  id: string;
  projectId: string;
  name: string;
  statusMapped: TaskStatus | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type Tag = {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
};

export type ChecklistItem = {
  id: string;
  title: string;
  completed: boolean;
  position: number;
};

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  interval: number;
};

export type Task = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  columnId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  startAt: string | null;
  completedAt: string | null;
  position: number;
  assigneeIds: string[];
  tagIds: string[];
  parentTaskId: string | null;
  recurrence: RecurrenceRule | null;
  checklist: ChecklistItem[];
  createdById: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type CommentMention = { userId: string; start: number; end: number };

export type Comment = {
  mentions?: CommentMention[];
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  editedAt?: string | null;
  deletedAt: string | null;
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  uploadedById: string;
  filename: string;
  mime: string;
  sizeBytes: number;
  /** Flow's authorised download route — never a public storage URL. */
  url: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type FlowProfile = {
  taskSaveMode?: "auto" | "manual";
  displayName: string | null;
  title: string | null;
  timezone: string | null;
  bio: string | null;
};

export type ActivityEvent = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  taskId: string | null;
  actorId: string;
  verb: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ListTasksQuery = {
  workspaceId: string;
  projectId?: string | null;
  /** `null` = top-level only; string = children of that parent; omit = any. */
  parentTaskId?: string | null;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  tagIds?: string[];
  assigneeId?: string;
  dueBefore?: string;
  dueAfter?: string;
  unscheduled?: boolean;
  search?: string;
  includeDeleted?: boolean;
};

export type ReorderTasksInput = {
  projectId: string;
  moves: Array<{
    taskId: string;
    columnId: string | null;
    position: number;
    status?: TaskStatus;
  }>;
};

export type CreateTaskInput = {
  workspaceId: string;
  projectId?: string | null;
  columnId?: string | null;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string | null;
  assigneeIds?: string[];
  tagIds?: string[];
  parentTaskId?: string | null;
  position?: number;
};

export type AppNotification = {
  id: string;
  kind: "mention" | "assigned" | "comment";
  workspaceId: string;
  taskId: string;
  taskTitle: string;
  actorName: string;
  /** Opens the task (and the comment, when there is one). */
  href: string;
  read: boolean;
  createdAt: string;
};

export type TrashedTask = {
  task: Task;
  projectName: string | null;
  /** The task's project was deleted too; restoring files it in the Inbox. */
  projectDeleted: boolean;
};

export type CreateProjectInput = {
  workspaceId: string;
  name: string;
  description?: string | null;
  color?: string | null;
  defaultView?: ProjectView;
};

/** Backend-agnostic data access. Features talk to REST; REST uses this. */
export interface SyncProvider {
  listWorkspaces(): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace & { role: MemberRole }>;
  createWorkspace(input: { name: string; kind: "team" }): Promise<Workspace>;
  updateWorkspace(id: string, patch: { name: string }): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;

  listProjects(workspaceId: string): Promise<Project[]>;
  getProject(projectId: string): Promise<Project & { columns: BoardColumn[] }>;
  createProject(input: CreateProjectInput): Promise<Project>;
  updateProject(
    projectId: string,
    patch: { name?: string; description?: string | null },
  ): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;

  /**
   * Board columns. Every column maps to a board status, and each of
   * todo / in progress / done keeps at least one column. Each call returns the
   * project's columns in order.
   */
  createColumn(projectId: string, input: { name: string; statusMapped: BoardStatus }): Promise<BoardColumn[]>;
  updateColumn(columnId: string, patch: { name?: string; statusMapped?: BoardStatus }): Promise<{ projectId: string; columns: BoardColumn[] }>;
  /** Moves the column's tasks to the first other column with the same status. */
  deleteColumn(columnId: string): Promise<{ projectId: string; columns: BoardColumn[] }>;
  reorderColumns(projectId: string, columnIds: string[]): Promise<BoardColumn[]>;

  listTasks(query: ListTasksQuery): Promise<Task[]>;
  getTask(taskId: string): Promise<Task>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(taskId: string, patch: Partial<Task>): Promise<Task>;
  deleteTask(taskId: string): Promise<Task>;
  /** Deleted tasks, most recently deleted first. */
  listTrash(workspaceId: string): Promise<TrashedTask[]>;
  restoreTask(taskId: string): Promise<Task>;
  reorderTasks(input: ReorderTasksInput): Promise<Task[]>;
  listTags(workspaceId: string): Promise<Tag[]>;
  createTag(workspaceId: string, input: { name: string; color?: string }): Promise<Tag>;

  listComments(taskId: string): Promise<Comment[]>;
  createComment(input: { taskId: string; body: string; mentions?: CommentMention[] }): Promise<Comment>;
  /** Authors only. Newly tagged members are queued for mention mail. */
  updateComment(commentId: string, input: { body: string; mentions?: CommentMention[] }): Promise<{ comment: Comment; projectId: string | null }>;
  /** Authors, or admins and owners. */
  deleteComment(commentId: string): Promise<{ taskId: string; projectId: string | null }>;
  listActivity(query: {
    workspaceId: string;
    taskId?: string;
    cursor?: string;
  }): Promise<{ items: ActivityEvent[]; nextCursor?: string }>;
}
