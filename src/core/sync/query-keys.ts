export const qk = {
  workspaces: ["workspaces"] as const,
  notifications: ["notifications"] as const,
  workspace: (id: string) => ["workspaces", id] as const,
  projects: (workspaceId: string) => ["projects", workspaceId] as const,
  project: (projectId: string) => ["project", projectId] as const,
  tasks: (workspaceId: string, filters: Record<string, string | undefined>) =>
    ["tasks", workspaceId, filters] as const,
  task: (taskId: string) => ["task", taskId] as const,
  filters: (workspaceId: string) => ["filters", workspaceId] as const,
  tags: (workspaceId: string) => ["tags", workspaceId] as const,
  sections: (projectId: string) => ["sections", projectId] as const,
  favoriteProjects: ["favorite-projects"] as const,
  members: (workspaceId: string) => ["members", workspaceId] as const,
  space: (workspaceId: string) => ["space", workspaceId] as const,
  comments: (taskId: string) => ["comments", taskId] as const,
  chat: (projectId: string) => ["chat", projectId] as const,
  attachments: (taskId: string) => ["attachments", taskId] as const,
  trash: (workspaceId: string) => ["trash", workspaceId] as const,
  activity: (workspaceId: string, taskId?: string) =>
    ["activity", workspaceId, taskId ?? "all"] as const,
};
