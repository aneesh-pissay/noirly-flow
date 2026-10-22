import { describe, expect, it } from "vitest";
import { taskUpdateEvents } from "@/src/core/webhooks";

describe("taskUpdateEvents", () => {
  it("adds task.completed only when a task is just finished", () => {
    expect(taskUpdateEvents("todo", "done")).toEqual(["task.updated", "task.completed"]);
    expect(taskUpdateEvents("done", "done")).toEqual(["task.updated"]);
    expect(taskUpdateEvents("todo", "in_progress")).toEqual(["task.updated"]);
    expect(taskUpdateEvents(null, "done")).toEqual(["task.updated", "task.completed"]);
  });
});
