import { describe, expect, it } from "vitest";
import {
  dateInputToIso,
  dueInputToIso,
  dueRange,
  dueTone,
  isoToDateInput,
  isoToTimeInput,
} from "@/src/features/task/dates";

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
