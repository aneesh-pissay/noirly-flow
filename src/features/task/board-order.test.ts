import { describe, expect, it } from "vitest";
import type { Task } from "@/src/core/sync/types";
import {
  buildReorderMoves,
  findContainer,
  groupTasksByColumn,
  moveTaskInGroups,
  resolveBoardColumns,
} from "@/src/features/task/board-order";

function task(partial: Partial<Task> & Pick<Task, "id" | "status">): Task {
  return {
    workspaceId: "ws",
    projectId: "proj",
    columnId: null,
    title: partial.id,
    description: null,
    priority: "none",
    dueAt: null,
    dueHasTime: false,
    deadlineAt: null,
    startAt: null,
    completedAt: null,
    position: 1000,
    assigneeIds: [],
    tagIds: [],
    parentTaskId: null,
    recurrence: null,
    checklist: [],
    createdById: "user",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...partial,
  };
}

describe("resolveBoardColumns", () => {
  it("falls back to status columns when none are persisted", () => {
    const columns = resolveBoardColumns([]);
    expect(columns.map((column) => column.status)).toEqual([
      "todo",
      "in_progress",
      "done",
    ]);
    expect(columns.every((column) => !column.isPersisted)).toBe(true);
  });
});

describe("groupTasksByColumn", () => {
  const columns = resolveBoardColumns([
    {
      id: "col-todo",
      projectId: "proj",
      name: "Todo",
      statusMapped: "todo",
      position: 1000,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "col-done",
      projectId: "proj",
      name: "Done",
      statusMapped: "done",
      position: 2000,
      createdAt: "",
      updatedAt: "",
    },
  ]);

  it("uses columnId when it matches, otherwise status", () => {
    const groups = groupTasksByColumn(
      [
        task({ id: "a", status: "todo", columnId: "col-todo", position: 2000 }),
        task({ id: "b", status: "todo", columnId: null, position: 1000 }),
        task({ id: "c", status: "done", columnId: "col-done", position: 1000 }),
        task({ id: "d", status: "canceled", columnId: "col-todo" }),
      ],
      columns,
    );
    expect(groups["col-todo"]?.map((item) => item.id)).toEqual(["b", "a"]);
    expect(groups["col-done"]?.map((item) => item.id)).toEqual(["c"]);
  });

  it("sends column-less tasks to the first of several columns with their status", () => {
    const shared = resolveBoardColumns([
      { id: "review", projectId: "proj", name: "Review", statusMapped: "in_progress", position: 3000, createdAt: "", updatedAt: "" },
      { id: "doing", projectId: "proj", name: "Doing", statusMapped: "in_progress", position: 2000, createdAt: "", updatedAt: "" },
      { id: "todo", projectId: "proj", name: "Todo", statusMapped: "todo", position: 1000, createdAt: "", updatedAt: "" },
    ]);
    expect(shared.map((column) => column.id)).toEqual(["todo", "doing", "review"]);
    const groups = groupTasksByColumn(
      [
        task({ id: "a", status: "in_progress", columnId: null }),
        task({ id: "b", status: "in_progress", columnId: "review" }),
      ],
      shared,
    );
    expect(groups["doing"]?.map((item) => item.id)).toEqual(["a"]);
    expect(groups["review"]?.map((item) => item.id)).toEqual(["b"]);
  });
});

describe("moveTaskInGroups + buildReorderMoves", () => {
  const columns = resolveBoardColumns([
    {
      id: "todo",
      projectId: "proj",
      name: "Todo",
      statusMapped: "todo",
      position: 1000,
      createdAt: "",
      updatedAt: "",
    },
    {
      id: "done",
      projectId: "proj",
      name: "Done",
      statusMapped: "done",
      position: 2000,
      createdAt: "",
      updatedAt: "",
    },
  ]);

  it("moves a card into another column and densifies positions", () => {
    const groups = groupTasksByColumn(
      [
        task({ id: "a", status: "todo", columnId: "todo", position: 1000 }),
        task({ id: "b", status: "todo", columnId: "todo", position: 2000 }),
        task({ id: "c", status: "done", columnId: "done", position: 1000 }),
      ],
      columns,
    );

    expect(findContainer(groups, "a")).toBe("todo");
    expect(findContainer(groups, "column:done")).toBe("done");
    const next = moveTaskInGroups(groups, "a", "done");
    expect(next).not.toBeNull();
    expect(next!["todo"]?.map((item) => item.id)).toEqual(["b"]);
    expect(next!["done"]?.map((item) => item.id)).toEqual(["c", "a"]);

    const moves = buildReorderMoves(next!, columns, ["todo", "done"]);
    expect(moves).toEqual([
      { taskId: "b", columnId: "todo", position: 1000, status: "todo" },
      { taskId: "c", columnId: "done", position: 1000, status: "done" },
      { taskId: "a", columnId: "done", position: 2000, status: "done" },
    ]);
  });
});
