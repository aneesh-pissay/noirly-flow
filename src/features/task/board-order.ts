import type { BoardColumn, Task } from "@/src/core/sync/types";
import type { TaskStatus } from "@/src/core/models/enums";

export const BOARD_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

export type BoardColumnView = {
  id: string;
  name: string;
  status: TaskStatus;
  /** False for status fallback columns without a Mongo column id. */
  isPersisted: boolean;
};

export type ColumnTasks = Record<string, Task[]>;

export function resolveBoardColumns(
  columns: BoardColumn[] | undefined,
): BoardColumnView[] {
  const mapped = (columns ?? [])
    .filter(
      (column) =>
        column.statusMapped && BOARD_STATUSES.includes(column.statusMapped),
    )
    .sort((a, b) => a.position - b.position)
    .map((column) => ({
      id: column.id,
      name: column.name,
      status: column.statusMapped as TaskStatus,
      isPersisted: true,
    }));

  if (mapped.length > 0) {
    return mapped;
  }

  return [
    { id: "todo", name: "Todo", status: "todo", isPersisted: false },
    {
      id: "in_progress",
      name: "In progress",
      status: "in_progress",
      isPersisted: false,
    },
    { id: "done", name: "Done", status: "done", isPersisted: false },
  ];
}

export function groupTasksByColumn(
  tasks: Task[],
  columns: BoardColumnView[],
): ColumnTasks {
  const groups: ColumnTasks = Object.fromEntries(
    columns.map((column) => [column.id, []]),
  );
  // Several columns can share a status; tasks without a column go to the first.
  const byStatus = new Map<TaskStatus, string>();
  for (const column of columns) {
    if (!byStatus.has(column.status)) byStatus.set(column.status, column.id);
  }

  for (const task of tasks) {
    if (task.status === "canceled") continue;
    const columnId =
      (task.columnId && groups[task.columnId] ? task.columnId : null) ??
      byStatus.get(task.status);
    if (!columnId || !groups[columnId]) continue;
    groups[columnId].push(task);
  }

  for (const columnId of Object.keys(groups)) {
    groups[columnId].sort((a, b) => a.position - b.position);
  }

  return groups;
}

export function densePositions(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * 1000);
}

export function columnDroppableId(columnId: string): string {
  return `column:${columnId}`;
}

export function findContainer(
  groups: ColumnTasks,
  id: string | null,
): string | null {
  if (!id) return null;
  const asColumn = id.startsWith("column:") ? id.slice("column:".length) : id;
  if (asColumn in groups) return asColumn;
  for (const [columnId, columnTasks] of Object.entries(groups)) {
    if (columnTasks.some((task) => task.id === id)) {
      return columnId;
    }
  }
  return null;
}

export function moveTaskInGroups(
  groups: ColumnTasks,
  activeId: string,
  overId: string,
): ColumnTasks | null {
  const activeContainer = findContainer(groups, activeId);
  const overContainer = findContainer(groups, overId);
  if (!activeContainer || !overContainer) return null;

  const next: ColumnTasks = Object.fromEntries(
    Object.entries(groups).map(([key, value]) => [key, [...value]]),
  );

  const activeIndex = next[activeContainer].findIndex(
    (task) => task.id === activeId,
  );
  if (activeIndex < 0) return null;
  const [moved] = next[activeContainer].splice(activeIndex, 1);
  if (!moved) return null;

  if (activeContainer === overContainer) {
    let overIndex = next[overContainer].findIndex((task) => task.id === overId);
    if (overIndex < 0) overIndex = next[overContainer].length;
    // After removal, if we dragged downward, overIndex may need adjustment —
    // findIndex is on the already-spliced array so it's correct.
    next[overContainer].splice(overIndex, 0, moved);
    return next;
  }

  if (overId === overContainer || overId === `column:${overContainer}`) {
    next[overContainer].push(moved);
    return next;
  }

  const overIndex = next[overContainer].findIndex((task) => task.id === overId);
  const insertAt = overIndex >= 0 ? overIndex : next[overContainer].length;
  next[overContainer].splice(insertAt, 0, moved);
  return next;
}

export function buildReorderMoves(
  groups: ColumnTasks,
  columns: BoardColumnView[],
  affectedColumnIds: string[],
) {
  const columnById = new Map(columns.map((column) => [column.id, column]));
  const moves: Array<{
    taskId: string;
    columnId: string | null;
    position: number;
    status: TaskStatus;
  }> = [];

  for (const columnId of affectedColumnIds) {
    const column = columnById.get(columnId);
    if (!column) continue;
    const columnTasks = groups[columnId] ?? [];
    const positions = densePositions(columnTasks.length);
    columnTasks.forEach((task, index) => {
      moves.push({
        taskId: task.id,
        columnId: column.isPersisted ? column.id : null,
        position: positions[index]!,
        status: column.status,
      });
    });
  }

  return moves;
}

export function flattenGroups(groups: ColumnTasks): Task[] {
  return Object.values(groups).flat();
}
