import { describe, expect, it } from "vitest";
import { habitStats, occurrenceState, type Occurrence } from "@/src/core/habits";

const now = new Date(2026, 7, 14, 10); // Friday 14 August 2026
const at = (day: number, hour = 12) => new Date(2026, 7, day, hour).toISOString();
let n = 0;
const occ = (due: number, done: number | null, status: Occurrence["status"] = done === null ? "todo" : "done"): Occurrence =>
  ({ id: String(++n), dueAt: at(due), completedAt: done === null ? null : at(done, 20), status });

describe("occurrenceState", () => {
  it("tells on time, late, overdue, open and skipped apart, by local day", () => {
    expect(occurrenceState(occ(10, 10), now)).toBe("on-time");
    expect(occurrenceState(occ(10, 9), now)).toBe("on-time");
    expect(occurrenceState(occ(10, 11), now)).toBe("late");
    expect(occurrenceState(occ(13, null), now)).toBe("overdue");
    expect(occurrenceState(occ(14, null), now)).toBe("open");
    expect(occurrenceState(occ(12, null, "canceled"), now)).toBe("skipped");
  });
});

describe("habitStats", () => {
  it("counts the current run back from now, and the best run ever", () => {
    const stats = habitStats([occ(8, 8), occ(9, 9), occ(10, 11), occ(11, 11), occ(12, null, "canceled"), occ(13, 13), occ(14, null)], now);
    expect(stats.current).toBe(2);
    expect(stats.best).toBe(2);
    expect(stats.history.map((h) => h.state)).toEqual(["on-time", "on-time", "late", "on-time", "skipped", "on-time", "open"]);
  });

  it("is broken by an occurrence left overdue", () => {
    expect(habitStats([occ(11, 11), occ(12, 12), occ(13, null)], now)).toMatchObject({ current: 0, best: 2 });
  });

  it("is zero with no history", () => {
    expect(habitStats([], now)).toMatchObject({ current: 0, best: 0, history: [] });
  });
});
