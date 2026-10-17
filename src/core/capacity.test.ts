import { describe, expect, it } from "vitest";
import type { Task } from "@/src/core/sync/types";
import { capacityOf, dayKey, hoursLabel, overBy, workload } from "@/src/core/capacity";

const mon = new Date(2026, 7, 10);
const tue = new Date(2026, 7, 11);
const at = (date: number, hour = 12) => new Date(2026, 7, date, hour).toISOString();
const task = (id: string, extra: Partial<Task>) =>
  ({ id, title: id, status: "todo", dueAt: null, durationMinutes: null, assigneeIds: [], ...extra }) as Task;

describe("workload", () => {
  const tasks = [
    task("a", { dueAt: at(10), durationMinutes: 300, assigneeIds: ["sam", "ana"] }),
    task("b", { dueAt: at(10, 15), durationMinutes: 240, assigneeIds: ["sam"] }),
    task("c", { dueAt: at(10), assigneeIds: ["sam"] }),
    task("done", { dueAt: at(10), durationMinutes: 600, assigneeIds: ["sam"], status: "done" }),
    task("unassigned", { dueAt: at(10), durationMinutes: 60 }),
    task("other-week", { dueAt: at(20), durationMinutes: 60, assigneeIds: ["sam"] }),
  ];
  const load = workload(tasks, ["sam", "ana"], [mon, tue]);

  it("adds open assigned durations per person per day; a shared task counts for each", () => {
    expect(load.get("sam")!.get(dayKey(mon))).toMatchObject({ minutes: 540, unestimated: 1 });
    expect(load.get("ana")!.get(dayKey(mon))).toMatchObject({ minutes: 300, unestimated: 0 });
    expect(load.get("sam")!.get(dayKey(tue))).toMatchObject({ minutes: 0, unestimated: 0 });
  });

  it("measures overload against that weekday's hours", () => {
    const capacity = capacityOf(null);
    expect(overBy(load.get("sam")!.get(dayKey(mon))!, capacity, mon)).toBe(60);
    expect(overBy(load.get("ana")!.get(dayKey(mon))!, capacity, mon)).toBe(0);
    // A weekend has no hours by default, so any work is over.
    expect(capacityOf(null)[0]).toBe(0);
    expect(capacityOf([60, 60, 60, 60, 60, 60, 60])[3]).toBe(60);
  });
});

describe("hoursLabel", () => {
  it("writes hours and minutes", () => {
    expect(hoursLabel(0)).toBe("0h");
    expect(hoursLabel(45)).toBe("45m");
    expect(hoursLabel(450)).toBe("7h 30m");
    expect(hoursLabel(480)).toBe("8h");
  });
});
