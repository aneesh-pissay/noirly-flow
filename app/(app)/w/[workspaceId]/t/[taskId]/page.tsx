import { notFound, redirect } from "next/navigation";
import { getSyncProvider } from "@/src/server/api/http";
import type { Task } from "@/src/core/sync/types";

type Params = { params: Promise<{ workspaceId: string; taskId: string }> };

/**
 * A task's lasting link: /w/:workspaceId/t/:taskId. It finds the task wherever
 * it is now (a project, or the Inbox) and opens it there, so a shared link
 * still works after the task moves.
 */
export default async function TaskLinkPage({ params }: Params) {
  const { workspaceId, taskId } = await params;
  if (!/^[a-f0-9]{24}$/i.test(taskId) || !/^[a-f0-9]{24}$/i.test(workspaceId)) notFound();
  const { sync } = await getSyncProvider();
  let task: Task;
  try {
    task = await sync.getTask(taskId);
  } catch {
    // Not found, deleted, or not yours to see: the same answer, so a link reveals nothing.
    notFound();
  }
  if (task.workspaceId !== workspaceId) notFound();
  redirect(`/w/${workspaceId}/${task.projectId ? `p/${task.projectId}` : "inbox"}?task=${task.id}`);
}
