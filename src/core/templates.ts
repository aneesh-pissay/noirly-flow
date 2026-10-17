import type { TaskPriority } from "@/src/core/models/enums";

/** One task in a template, with its subtasks (up to four levels in all). */
export type TemplateTask = {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  durationMinutes?: number | null;
  tagIds?: string[];
  /** Project templates: which of the template's sections it goes in, or none. */
  sectionIndex?: number | null;
  subtasks?: TemplateTask[];
};

export type TaskTemplateData = { task: TemplateTask };
export type ProjectTemplateData = { sections: string[]; tasks: TemplateTask[] };

export type Template =
  | { id: string; workspaceId: string; kind: "task"; name: string; data: TaskTemplateData; createdAt: string }
  | { id: string; workspaceId: string; kind: "project"; name: string; data: ProjectTemplateData; createdAt: string };

/** Every task in a template's trees, top level included. */
export function countTemplateTasks(tasks: TemplateTask[]): number {
  return tasks.reduce((sum, task) => sum + 1 + countTemplateTasks(task.subtasks ?? []), 0);
}
