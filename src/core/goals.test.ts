import { describe, expect, it } from "vitest";
import { goalState, percent, rollUp } from "@/src/core/goals";

describe("percent", () => {
  it("rounds, and is 0 with nothing linked", () => {
    expect(percent({ done: 1, total: 3 })).toBe(33);
    expect(percent({ done: 0, total: 0 })).toBe(0);
  });
});

describe("goalState", () => {
  const now = new Date(2026, 9, 19, 15);
  const noon = (day: number) => new Date(2026, 9, day, 12).toISOString();
  it("is empty, done, overdue after the due day, or open", () => {
    expect(goalState({ done: 0, total: 0 }, noon(1), now)).toBe("empty");
    expect(goalState({ done: 2, total: 2 }, noon(1), now)).toBe("done");
    expect(goalState({ done: 1, total: 2 }, noon(18), now)).toBe("overdue");
    expect(goalState({ done: 1, total: 2 }, noon(19), now)).toBe("open");
    expect(goalState({ done: 1, total: 2 }, null, now)).toBe("open");
  });
});

describe("rollUp", () => {
  it("adds every row to the goal and known milestones to themselves", () => {
    const { goal, byMilestone } = rollUp(["m1", "m2"], [
      { milestoneId: "m1", done: 1, total: 3 },
      { milestoneId: null, done: 2, total: 2 },
      { milestoneId: "gone", done: 0, total: 1 },
    ]);
    expect(goal).toEqual({ done: 3, total: 6 });
    expect(byMilestone.get("m1")).toEqual({ done: 1, total: 3 });
    expect(byMilestone.get("m2")).toEqual({ done: 0, total: 0 });
  });
});
