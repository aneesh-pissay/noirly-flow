import { describe, expect, it } from "vitest";
import { formatClock, pauseSession, remainingMs, resumeSession, startSession } from "@/src/features/focus/focus";

const task = { id: "t", workspaceId: "w", title: "Write" };

describe("focus sessions", () => {
  it("counts down from the start, and pausing holds what's left", () => {
    const session = startSession(task, 25, 0);
    expect(remainingMs(session, 60_000)).toBe(24 * 60_000);
    const paused = pauseSession(session, 60_000);
    expect(paused.endsAt).toBeNull();
    expect(remainingMs(paused, 10 * 60_000)).toBe(24 * 60_000);
    const resumed = resumeSession(paused, 10 * 60_000);
    expect(remainingMs(resumed, 11 * 60_000)).toBe(23 * 60_000);
  });

  it("never goes below zero", () => {
    expect(remainingMs(startSession(task, 15, 0), 20 * 60_000)).toBe(0);
  });

  it("formats the clock", () => {
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(59_001)).toBe("1:00");
    expect(formatClock(9_000)).toBe("0:09");
    expect(formatClock(65 * 60_000)).toBe("1:05:00");
  });
});
