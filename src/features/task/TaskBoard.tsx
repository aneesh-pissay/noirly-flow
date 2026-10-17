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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Settings2, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { COLUMN_STATUSES } from "@/src/core/models/enums";
import { qk } from "@/src/core/sync/query-keys";
import type { BoardColumn, BoardStatus, Project, Task } from "@/src/core/sync/types";
import { api } from "@/src/lib/api-client";
import {
  type BoardColumnView,
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
import { TaskDeadlineBadge, TaskDueBadge, TaskDurationBadge, TaskRepeatBadge, TaskStartBadge } from "@/src/features/task/TaskDueBadge";
import { PriorityBadge } from "@/src/features/task/priority";
import type { WorkspaceMember } from "@/src/features/workspace/members";

type Props = {
  workspaceId: string;
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
  workspaceId,
  projectId,
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

  const queryClient = useQueryClient();
  const [columnError, setColumnError] = useState<string | null>(null);
  function columnMutation<TInput>(run: (input: TInput) => Promise<{ columns: BoardColumn[] }>, tasksMove = false) {
    return {
      mutationFn: run,
      onMutate: () => setColumnError(null),
      onSuccess: ({ columns: next }: { columns: BoardColumn[] }) => {
        queryClient.setQueryData<{ project: Project & { columns: BoardColumn[] } }>(qk.project(projectId), (old) =>
          old ? { project: { ...old.project, columns: next } } : old,
        );
        if (tasksMove) void queryClient.invalidateQueries({ queryKey: ["tasks", workspaceId] });
      },
      onError: (error: Error) => setColumnError(error.message),
    };
  }
  const createColumn = useMutation(columnMutation((input: { name: string; statusMapped: BoardStatus }) => api.createColumn(projectId, input)));
  const updateColumn = useMutation(columnMutation((input: { columnId: string; patch: { name?: string; statusMapped?: BoardStatus } }) => api.updateColumn(input.columnId, input.patch)));
  const reorderColumns = useMutation(columnMutation((columnIds: string[]) => api.reorderColumns(projectId, columnIds)));
  const deleteColumn = useMutation(columnMutation((columnId: string) => api.deleteColumn(columnId), true));
  const columnBusy = createColumn.isPending || updateColumn.isPending || reorderColumns.isPending || deleteColumn.isPending;

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

  // Placeholder columns (a project with none saved) can't be edited.
  const canManage = canWrite && boardColumns.every((column) => column.isPersisted);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {columnError ? (
        <p role="alert" className="mb-3 text-sm text-[var(--foreground)]">{columnError}</p>
      ) : null}
      <div className="grid gap-4 lg:auto-cols-[minmax(16rem,1fr)] lg:grid-flow-col lg:overflow-x-auto lg:pb-2">
        {boardColumns.map((column, index) => (
          <BoardColumnDroppable
            key={column.id}
            column={column}
            tasks={groups[column.id] ?? []}
            members={members}
            canWrite={canWrite}
            onDelete={onDelete}
            onOpenTask={onOpenTask}
            header={
              <ColumnHeader
                column={column}
                count={(groups[column.id] ?? []).length}
                canManage={canManage}
                busy={columnBusy}
                isFirst={index === 0}
                isLast={index === boardColumns.length - 1}
                fallback={boardColumns.find((other) => other.id !== column.id && other.status === column.status) ?? null}
                onRename={(name) => updateColumn.mutate({ columnId: column.id, patch: { name } })}
                onStatus={(statusMapped) => updateColumn.mutate({ columnId: column.id, patch: { statusMapped } })}
                onMove={(direction) => {
                  const ids = boardColumns.map((item) => item.id);
                  const target = index + direction;
                  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
                  reorderColumns.mutate(ids);
                }}
                onDelete={() => deleteColumn.mutate(column.id)}
              />
            }
          />
        ))}
        {canManage ? (
          <AddColumn busy={columnBusy} onAdd={(input) => createColumn.mutateAsync(input)} />
        ) : null}
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

const STATUS_LABELS: Record<BoardStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
};

const fieldClass =
  "h-9 w-full rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 text-sm text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50";
const smallButtonClass =
  "inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[var(--hairline)] px-2 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] disabled:cursor-default disabled:opacity-40";

function ColumnHeader({
  column,
  count,
  canManage,
  busy,
  isFirst,
  isLast,
  fallback,
  onRename,
  onStatus,
  onMove,
  onDelete,
}: {
  column: BoardColumnView;
  count: number;
  canManage: boolean;
  busy: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** Where this column's cards go if it's deleted; none means it can't be. */
  fallback: BoardColumnView | null;
  onRename: (name: string) => void;
  onStatus: (status: BoardStatus) => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(column.name);
  const status = column.status as BoardStatus;
  // Shown when the name alone doesn't say which status the column sets.
  const showStatus = column.name.trim().toLowerCase() !== STATUS_LABELS[status].toLowerCase();

  if (!editing) {
    return (
      // The <h3> stays a direct child of this header, which sits directly in the column.
      <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
        <h3 className="truncate text-sm font-medium text-[var(--foreground)]">{column.name}</h3>
        <div className="row-span-2 flex items-center gap-1">
          <span className="font-mono text-xs text-[var(--muted-foreground)]">{count}</span>
          {canManage ? (
            <button
              type="button"
              aria-label={`Edit column ${column.name}`}
              title="Edit column"
              onClick={() => { setName(column.name); setEditing(true); }}
              className="rounded-md p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <Settings2 size={14} aria-hidden />
            </button>
          ) : null}
        </div>
        {showStatus ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
            {STATUS_LABELS[status]}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="mb-3 flex flex-col gap-2 rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--bg)] p-2"
      onSubmit={(event) => {
        event.preventDefault();
        const next = name.trim();
        if (next && next !== column.name) onRename(next);
        setEditing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); setEditing(false); }
      }}
    >
      <label className="text-xs text-[var(--muted-foreground)]">
        Name
        <input
          value={name}
          autoFocus
          maxLength={40}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
          className={`${fieldClass} mt-1`}
        />
      </label>
      <label className="text-xs text-[var(--muted-foreground)]">
        Cards here are
        <select
          value={status}
          disabled={busy || !fallback}
          title={fallback ? undefined : "The only column for this status"}
          onChange={(event) => onStatus(event.target.value as BoardStatus)}
          className={`${fieldClass} mt-1 cursor-pointer`}
        >
          {COLUMN_STATUSES.map((value) => (
            <option key={value} value={value}>{STATUS_LABELS[value]}</option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" className={smallButtonClass} disabled={busy || isFirst} onClick={() => onMove(-1)} aria-label="Move column left">
          <ChevronLeft size={12} aria-hidden /> Left
        </button>
        <button type="button" className={smallButtonClass} disabled={busy || isLast} onClick={() => onMove(1)} aria-label="Move column right">
          Right <ChevronRight size={12} aria-hidden />
        </button>
        <button
          type="button"
          className={`${smallButtonClass} ml-auto hover:text-red-600 dark:hover:text-red-400`}
          disabled={busy || !fallback}
          title={fallback ? undefined : `Each status needs a column; add another ${STATUS_LABELS[status]} column first`}
          onClick={() => {
            if (!fallback) return;
            const moved = count ? ` Its ${count} task${count === 1 ? "" : "s"} move to “${fallback.name}”.` : "";
            if (!window.confirm(`Delete column “${column.name}”?${moved}`)) return;
            setEditing(false);
            onDelete();
          }}
        >
          <Trash2 size={12} aria-hidden /> Delete
        </button>
      </div>
      {!fallback ? (
        <p className="text-[11px] text-[var(--muted-foreground)]">
          This is the only {STATUS_LABELS[status]} column, so it can&apos;t be deleted or change status.
        </p>
      ) : null}
      <div className="flex justify-end gap-1">
        <button type="button" className={smallButtonClass} onClick={() => setEditing(false)}>Cancel</button>
        <button type="submit" className={smallButtonClass} disabled={busy || !name.trim()}>Save</button>
      </div>
    </form>
  );
}

function AddColumn({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (input: { name: string; statusMapped: BoardStatus }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<BoardStatus>("in_progress");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 cursor-pointer items-center justify-center gap-1 self-start rounded-[var(--r-lg)] border border-dashed border-[var(--hairline)] px-3 py-3 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
      >
        <Plus size={14} aria-hidden /> Add column
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 self-start rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        const next = name.trim();
        if (!next) return;
        void onAdd({ name: next, statusMapped: status }).then(() => {
          setName("");
          setOpen(false);
        }, () => {});
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
      }}
    >
      <label className="text-xs text-[var(--muted-foreground)]">
        Column name
        <input
          value={name}
          autoFocus
          maxLength={40}
          disabled={busy}
          placeholder="e.g. Review"
          onChange={(event) => setName(event.target.value)}
          className={`${fieldClass} mt-1`}
        />
      </label>
      <label className="text-xs text-[var(--muted-foreground)]">
        Cards here are
        <select
          value={status}
          disabled={busy}
          onChange={(event) => setStatus(event.target.value as BoardStatus)}
          className={`${fieldClass} mt-1 cursor-pointer`}
        >
          {COLUMN_STATUSES.map((value) => (
            <option key={value} value={value}>{STATUS_LABELS[value]}</option>
          ))}
        </select>
      </label>
      <div className="flex justify-end gap-1">
        <button type="button" className={smallButtonClass} onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className={smallButtonClass} disabled={busy || !name.trim()}>
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}

function BoardColumnDroppable({
  column,
  header,
  tasks,
  members,
  canWrite,
  onDelete,
  onOpenTask,
}: {
  column: BoardColumnView;
  header: ReactNode;
  tasks: Task[];
  members: WorkspaceMember[];
  canWrite: boolean;
  onDelete: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: columnDroppableId(column.id),
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
      {header}
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
              <PriorityBadge priority={task.priority} />
              <TaskStartBadge startAt={task.startAt} />
              <TaskDueBadge dueAt={task.dueAt} hasTime={task.dueHasTime} />
              <TaskDeadlineBadge deadlineAt={task.deadlineAt} />
              <TaskDurationBadge minutes={task.durationMinutes} />
              <TaskRepeatBadge rule={task.recurrence} />
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
