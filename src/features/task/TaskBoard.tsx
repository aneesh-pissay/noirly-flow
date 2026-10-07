"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import type { BoardColumn, Task } from "@/src/core/sync/types";
import {
  buildReorderMoves,
  columnDroppableId,
  findContainer,
  flattenGroups,
  groupTasksByColumn,
  moveTaskInGroups,
  resolveBoardColumns,
  type ColumnTasks,
} from "@/src/features/task/board-order";
import { AssigneeChips } from "@/src/features/task/AssigneeChips";
import { TaskDueBadge } from "@/src/features/task/TaskDueBadge";
import type { WorkspaceMember } from "@/src/features/workspace/members";

type Props = {
  projectId: string;
  tasks: Task[];
  columns: BoardColumn[] | undefined;
  members: WorkspaceMember[];
  canWrite?: boolean;
  onReorder: (
    moves: Array<{
      taskId: string;
      columnId: string | null;
      position: number;
      status: Task["status"];
    }>,
  ) => Promise<void> | void;
  onDelete: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
};

export function TaskBoard({
  projectId: _projectId,
  tasks,
  columns,
  members,
  canWrite = true,
  onReorder,
  onDelete,
  onOpenTask,
}: Props) {
  const boardColumns = useMemo(() => resolveBoardColumns(columns), [columns]);
  const [groups, setGroups] = useState<ColumnTasks>(() =>
    groupTasksByColumn(tasks, boardColumns),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Regroup when tasks or columns change, but not mid-drag. Ending a drag
  // always regroups, so changes that arrived during it (new tasks, real
  // column ids replacing placeholders) are never lost.
  const [synced, setSynced] = useState({ tasks, boardColumns, dragging });
  if (dragging !== synced.dragging && dragging) {
    setSynced({ tasks, boardColumns, dragging });
  } else if (
    !dragging &&
    (synced.dragging || synced.tasks !== tasks || synced.boardColumns !== boardColumns)
  ) {
    setSynced({ tasks, boardColumns, dragging });
    setGroups(groupTasksByColumn(tasks, boardColumns));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const collisionDetection: CollisionDetection = (args) => {
    const pointerHits = pointerWithin(args);
    if (pointerHits.length > 0) return pointerHits;
    return closestCorners(args);
  };

  const activeTask = activeId
    ? flattenGroups(groups).find((task) => task.id === activeId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    if (!canWrite) return;
    setDragging(true);
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    if (!canWrite) return;
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);
    const activeContainer = findContainer(groups, activeTaskId);
    const overContainer = findContainer(groups, overId);
    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    setGroups((current) => {
      const next = moveTaskInGroups(current, activeTaskId, overId);
      return next ?? current;
    });
  }

  function handleDragCancel() {
    setDragging(false);
    setActiveId(null);
    setGroups(groupTasksByColumn(tasks, boardColumns));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!canWrite) {
      setDragging(false);
      return;
    }
    if (!over) {
      setDragging(false);
      setGroups(groupTasksByColumn(tasks, boardColumns));
      return;
    }

    const activeTaskId = String(active.id);
    const overId = String(over.id);
    const previous = groupTasksByColumn(tasks, boardColumns);
    const from = findContainer(previous, activeTaskId);

    let next = groups;
    const activeContainer = findContainer(groups, activeTaskId);
    const overContainer = findContainer(groups, overId);

    // Cross-column moves are applied in onDragOver; same-column still needs apply.
    if (
      activeContainer &&
      overContainer &&
      activeContainer === overContainer
    ) {
      const reordered = moveTaskInGroups(groups, activeTaskId, overId);
      if (reordered) {
        next = reordered;
        setGroups(next);
      }
    }

    const to = findContainer(next, activeTaskId);
    if (!from || !to) {
      setDragging(false);
      return;
    }

    const affected = from === to ? [from] : [...new Set([from, to])];
    const unchanged = affected.every(
      (columnId) =>
        (previous[columnId] ?? []).map((task) => task.id).join() ===
        (next[columnId] ?? []).map((task) => task.id).join(),
    );
    if (unchanged) {
      setDragging(false);
      return;
    }

    const moves = buildReorderMoves(next, boardColumns, affected);
    if (moves.length === 0) {
      setDragging(false);
      return;
    }

    try {
      await onReorder(moves);
    } catch {
      setGroups(previous);
    } finally {
      setDragging(false);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {boardColumns.map((column) => (
          <BoardColumnDroppable
            key={column.id}
            columnId={column.id}
            title={column.name}
            tasks={groups[column.id] ?? []}
            members={members}
            canWrite={canWrite}
            onDelete={onDelete}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="border border-[var(--hairline)] bg-[var(--bg)] p-3">
            <p className="text-sm text-[var(--foreground)]">{activeTask.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function BoardColumnDroppable({
  columnId,
  title,
  tasks,
  members,
  canWrite,
  onDelete,
  onOpenTask,
}: {
  columnId: string;
  title: string;
  tasks: Task[];
  members: WorkspaceMember[];
  canWrite: boolean;
  onDelete: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDroppableId(columnId),
    disabled: !canWrite,
  });
  const ids = tasks.map((task) => task.id);

  return (
    <div
      ref={setNodeRef}
      className={`rounded-[var(--r-lg)] border bg-[var(--surface)] p-3 transition-colors ${
        isOver ? "border-[var(--accent)]" : "border-[var(--hairline)]"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--foreground)]">{title}</h3>
        <span className="font-mono text-xs text-[var(--muted-foreground)]">{tasks.length}</span>
      </div>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-24 flex-col gap-2">
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              members={members}
              canWrite={canWrite}
              onDelete={onDelete}
              onOpenTask={onOpenTask}
            />
          ))}
          {tasks.length === 0 ? (
            <li className="px-1 py-6 text-center text-xs text-[var(--muted-foreground)]">
              {canWrite ? "Drop tasks here" : "No tasks"}
            </li>
          ) : null}
        </ul>
      </SortableContext>
    </div>
  );
}

function SortableTaskCard({
  task,
  members,
  canWrite,
  onDelete,
  onOpenTask,
}: {
  task: Task;
  members: WorkspaceMember[];
  canWrite: boolean;
  onDelete: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !canWrite || task.id.startsWith("tmp-"),
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--bg)] p-3 ${
        isDragging ? "opacity-40" : ""
      } ${canWrite && !task.id.startsWith("tmp-") ? "cursor-grab touch-none active:cursor-grabbing" : ""}`}
      {...(canWrite && !task.id.startsWith("tmp-")
        ? { ...attributes, ...listeners }
        : {})}
    >
      <div className="flex items-start gap-2">
        {canWrite ? (
          <span
            aria-hidden
            className="inline-flex h-8 w-5 shrink-0 items-center justify-center select-none text-[var(--muted-foreground)]"
          >
            ⋮⋮
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            className="w-full cursor-pointer text-left"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onOpenTask(task.id)}
          >
            <p className="text-sm text-[var(--foreground)]">{task.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                {task.priority === "none" ? "no priority" : task.priority}
              </p>
              <TaskDueBadge dueAt={task.dueAt} />
              <AssigneeChips assigneeIds={task.assigneeIds} members={members} />
            </div>
          </button>
          {canWrite ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onDelete(task.id)}
                className="inline-flex h-8 items-center rounded-lg border border-[var(--hairline)] px-3 text-xs text-[var(--muted-foreground)] transition-colors hover:border-[var(--accent)] hover:text-[var(--foreground)]"
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
