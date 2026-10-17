import { describe, expect, it } from "vitest";
import type { Task } from "@/src/core/sync/types";
import { agendaRange, agendaSections } from "@/src/features/task/agenda";

// Friday 14 August 2026, 10:00 local time.
const now = new Date(2026, 7, 14, 10, 0);
const task = (id: string, dueAt: Date, extra: Partial<Task> = {}) =>
  ({ id, title: id, dueAt: dueAt.toISOString(), dueHasTime: false, priority: "none", ...extra }) as Task;

describe("agendaRange", () => {
  it("Today covers everything due up to the end of today", () => {
    expect(agendaRange("today", now)).toEqual({ dueBefore: new Date(2026, 7, 14, 23, 59, 59, 999).toISOString() });
  });

  it("Upcoming covers tomorrow through two weeks out, in local days", () => {
    expect(agendaRange("upcoming", now)).toEqual({
      dueAfter: new Date(2026, 7, 15).toISOString(),
      dueBefore: new Date(2026, 7, 28, 23, 59, 59, 999).toISOString(),
    });
  });
});

describe("agendaSections", () => {
  it("splits overdue from today, counting a passed time as overdue", () => {
    const sections = agendaSections("today", [
      task("yesterday", new Date(2026, 7, 13, 12)),
      task("this morning", new Date(2026, 7, 14, 9), { dueHasTime: true }),
      task("tonight", new Date(2026, 7, 14, 20), { dueHasTime: true }),
      task("all day", new Date(2026, 7, 14, 12), { priority: "high" }),
    ], now);
    expect(sections.map((s) => [s.key, s.tasks.map((t) => t.id)])).toEqual([
      ["overdue", ["yesterday", "this morning"]],
      ["today", ["all day", "tonight"]],
    ]);
  });

  it("groups upcoming tasks by day and names tomorrow", () => {
    const sections = agendaSections("upcoming", [
      task("monday", new Date(2026, 7, 17, 12)),
      task("tomorrow", new Date(2026, 7, 15, 12)),
    ], now);
    expect(sections.map((s) => s.key)).toEqual(["2026-08-15", "2026-08-17"]);
    expect(sections[0]!.label).toMatch(/^Tomorrow · /);
  });
});
