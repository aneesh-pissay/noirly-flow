"use client";

import {
  useChannel,
  usePresence,
  useRealtimeClient,
  useRealtimeEvent,
  useRealtimeStatus,
} from "@noirly-dev/realtime-client/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { shouldApplyLww } from "@noirly-dev/realtime-shared";
import type { Comment, Task } from "@/src/core/sync/types";
import { qk } from "@/src/core/sync/query-keys";
import { setRealtimeScope } from "@/src/features/realtime/FlowRealtimeProvider";
import { PresenceAvatars } from "@/src/features/realtime/PresenceAvatars";

type ReorderedPayload = {
  projectId: string;
  tasks: Task[];
  version: number;
};

type UpsertPayload = {
  task: Task;
  version: number;
};

type DeletePayload = {
  taskId: string;
};

type CommentPayload = {
  taskId: string;
  comment: Comment;
};

export function ProjectRealtime({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const client = useRealtimeClient();
  const status = useRealtimeStatus();
  const queryClient = useQueryClient();
  const channel = `project:${projectId}`;

  useEffect(() => {
    setRealtimeScope(workspaceId, projectId);
    void client.connect().catch(() => {
      /* board keeps polling until the socket is up */
    });
  }, [client, workspaceId, projectId]);

  useChannel(channel, { presence: true });
  const { members } = usePresence(channel, { collapseByUserId: true });

  useRealtimeEvent<ReorderedPayload>(channel, "tasks.reordered", (data) => {
    patchTasks(workspaceId, (tasks) => mergeById(tasks, data.tasks));
  });

  useRealtimeEvent<UpsertPayload>(channel, "task.upsert", (data) => {
    const incoming = Date.parse(data.task.updatedAt);
    patchTasks(workspaceId, (tasks) => {
      const idx = tasks.findIndex((task) => task.id === data.task.id);
      if (idx === -1) {
        if (data.task.projectId !== projectId) return tasks;
        return [...tasks, data.task];
      }
      const cached = tasks[idx]!;
      if (
        !shouldApplyLww(
          { version: incoming },
          { version: Date.parse(cached.updatedAt) },
        )
      ) {
        return tasks;
      }
      const next = tasks.slice();
      next[idx] = data.task;
      return next;
    });
    void queryClient.invalidateQueries({ queryKey: qk.task(data.task.id) });
  });

  useRealtimeEvent<DeletePayload>(channel, "task.delete", (data) => {
    patchTasks(workspaceId, (tasks) =>
      tasks.filter((task) => task.id !== data.taskId),
    );
  });

  useRealtimeEvent<CommentPayload>(channel, "comment.created", (data) => {
    void queryClient.invalidateQueries({ queryKey: qk.comments(data.taskId) });
    void queryClient.invalidateQueries({
      queryKey: qk.activity(workspaceId, data.taskId),
    });
  });

  // Project chat: refetch rather than splice, so pages and order stay the server's.
  useRealtimeEvent(channel, "chat.message", () => {
    void queryClient.invalidateQueries({ queryKey: qk.chat(projectId) });
  });
  useRealtimeEvent(channel, "chat.message.deleted", () => {
    void queryClient.invalidateQueries({ queryKey: qk.chat(projectId) });
  });

  return <PresenceAvatars members={members} status={status} />;

  function patchTasks(
    wsId: string,
    updater: (tasks: Task[]) => Task[],
  ): void {
    queryClient.setQueriesData<{ tasks: Task[] }>(
      { queryKey: ["tasks", wsId] },
      (old) => (old ? { tasks: updater(old.tasks) } : old),
    );
  }
}

function mergeById(current: Task[], incoming: Task[]): Task[] {
  const byId = new Map(incoming.map((task) => [task.id, task]));
  return current.map((task) => byId.get(task.id) ?? task);
}
