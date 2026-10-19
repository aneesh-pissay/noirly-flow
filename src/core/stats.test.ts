import { describe, expect, it } from "vitest";
import { countByDay, countByWeek, daysAgo, minutesBetween, onTimeRate, overdueCount, weekStart } from "@/src/core/stats";

const now = new Date(2026, 7, 14, 10); // Friday 14 August 2026
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 7, day, hour, minute).toISOString();

describe("countByDay / countByWeek", () => {
  it("buckets by local day and by Monday-to-Sunday week", () => {
    const days = [daysAgo(now, 2), daysAgo(now, 1), daysAgo(now, 0)];
    expect(countByDay([at(12), at(14, 1), at(14, 23), at(9)], days)).toEqual([1, 0, 2]);
    expect(weekStart(now)).toEqual(new Date(2026, 7, 10));
    expect(countByWeek([at(10), at(16), at(17), at(3)], [new Date(2026, 7, 10), new Date(2026, 7, 17)])).toEqual([2, 1]);
  });
});

describe("onTimeRate", () => {
  it("compares against the due time when there is one, else the due day; undated tasks don't count", () => {
    const result = onTimeRate([
      { completedAt: at(14, 22), dueAt: at(14), dueHasTime: false },
      { completedAt: at(15, 9), dueAt: at(14), dueHasTime: false },
      { completedAt: at(14, 15), dueAt: at(14, 14), dueHasTime: true },
      { completedAt: at(14, 13), dueAt: at(14, 14), dueHasTime: true },
      { completedAt: at(14), dueAt: null, dueHasTime: false },
    ]);
    expect(result).toEqual({ onTime: 2, total: 4, rate: 0.5 });
    expect(onTimeRate([]).rate).toBeNull();
  });
});

describe("overdueCount / minutesBetween", () => {
  it("counts what's past due now, and tracked minutes in a range", () => {
    expect(overdueCount([
      { dueAt: at(13), dueHasTime: false },
      { dueAt: at(14), dueHasTime: false },
      { dueAt: at(14, 9), dueHasTime: true },
      { dueAt: at(14, 11), dueHasTime: true },
    ], now)).toBe(2);
    expect(minutesBetween([{ startedAt: at(10), minutes: 30 }, { startedAt: at(14), minutes: 45 }, { startedAt: at(17), minutes: 60 }],
      new Date(2026, 7, 10), new Date(2026, 7, 17))).toBe(75);
  });
});
