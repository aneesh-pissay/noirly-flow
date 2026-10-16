import { describe, expect, it } from "vitest";
import {
  dateInputToIso,
  dueInputToIso,
  dueRange,
  dueTone,
  formatDuration,
  isoToDateInput,
  isoToTimeInput,
  startAfterDue,
  startsLater,
} from "@/src/features/task/dates";

describe("formatDuration", () => {
  it("writes minutes, hours, or both", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
  });
});

describe("start date", () => {
  it("has not started while the start day is ahead", () => {
    const now = new Date(2026, 7, 14, 23, 0);
    expect(startsLater(dateInputToIso("2026-08-15"), now)).toBe(true);
    expect(startsLater(dateInputToIso("2026-08-14"), now)).toBe(false);
    expect(startsLater(null, now)).toBe(false);
  });

  it("may be on the due day but not after it", () => {
    expect(startAfterDue("2026-08-14", "2026-08-14")).toBe(false);
    expect(startAfterDue("2026-08-15", "2026-08-14")).toBe(true);
    expect(startAfterDue("2026-08-15", "")).toBe(false);
    expect(startAfterDue("", "2026-08-14")).toBe(false);
  });
});

describe("due time", () => {
  it("keeps the chosen time and round-trips it", () => {
    const iso = dueInputToIso("2026-08-14", "15:30");
    expect(isoToDateInput(iso)).toBe("2026-08-14");
    expect(isoToTimeInput(iso, true)).toBe("15:30");
  });

  it("stores an all-day date at local noon and shows no time", () => {
    const iso = dueInputToIso("2026-08-14", "");
    expect(iso).toBe(dateInputToIso("2026-08-14"));
    expect(new Date(iso!).getHours()).toBe(12);
    expect(isoToTimeInput(iso, false)).toBe("");
  });

  it("is overdue once the time passes, but an all-day task only the next day", () => {
    const now = new Date(2026, 7, 14, 16, 0);
    const earlierToday = new Date(2026, 7, 14, 9, 0).toISOString();
    const laterToday = new Date(2026, 7, 14, 18, 0).toISOString();
    expect(dueTone(earlierToday, true, now)).toBe("overdue");
    expect(dueTone(laterToday, true, now)).toBe("today");
    expect(dueTone(earlierToday, false, now)).toBe("today");
  });
});

describe("date input round-trip", () => {
  it("converts a date input to ISO and back", () => {
    const iso = dateInputToIso("2026-08-14");
    expect(iso).toBeTruthy();
    expect(isoToDateInput(iso)).toBe("2026-08-14");
  });

  it("treats empty as no date", () => {
    expect(dateInputToIso("")).toBeNull();
    expect(isoToDateInput(null)).toBe("");
  });
});

describe("dueRange", () => {
  it("marks unscheduled for none", () => {
    expect(dueRange("none")).toEqual({ unscheduled: true });
  });

  it("returns nothing when unset", () => {
    expect(dueRange("")).toEqual({});
    expect(dueRange(undefined)).toEqual({});
  });
});
