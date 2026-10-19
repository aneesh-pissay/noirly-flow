import { describe, expect, it } from "vitest";
import { elapsedMinutes, parseDuration, stopwatch } from "@/src/core/time-tracking";

describe("parseDuration", () => {
  it("reads minutes, hours and h:mm", () => {
    expect(parseDuration("45")).toBe(45);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("45 min")).toBe(45);
    expect(parseDuration("1h")).toBe(60);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("2 hours")).toBe(120);
    expect(parseDuration("1:30")).toBe(90);
  });

  it("refuses nonsense, zero and more than a day", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("soon")).toBeNull();
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("25h")).toBeNull();
  });
});

describe("elapsedMinutes", () => {
  it("rounds to whole minutes, at least one, at most a day", () => {
    const start = new Date(2026, 7, 14, 9);
    expect(elapsedMinutes(start, new Date(2026, 7, 14, 9, 44, 40))).toBe(45);
    expect(elapsedMinutes(start, new Date(2026, 7, 14, 9, 0, 10))).toBe(1);
    expect(elapsedMinutes(start, new Date(2026, 7, 16, 9))).toBe(1440);
  });
});

describe("stopwatch", () => {
  it("shows minutes and seconds, and hours once past one", () => {
    expect(stopwatch(65_000)).toBe("1:05");
    expect(stopwatch(3_725_000)).toBe("1:02:05");
  });
});
