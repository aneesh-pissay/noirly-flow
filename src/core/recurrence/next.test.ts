import { describe, expect, it } from "vitest";
import {
  addRecurrenceInterval,
  asRecurrenceRule,
  nextOccurrenceDueAt,
} from "@/src/core/recurrence/next";

describe("asRecurrenceRule", () => {
  it("accepts daily and weekly with defaults", () => {
    expect(asRecurrenceRule({ frequency: "daily", interval: 2 })).toEqual({
      frequency: "daily",
      interval: 2,
    });
    expect(asRecurrenceRule({ frequency: "weekly" })).toEqual({
      frequency: "weekly",
      interval: 1,
    });
  });

  it("rejects empty or unsupported rules", () => {
    expect(asRecurrenceRule(null)).toBeNull();
    expect(asRecurrenceRule({ frequency: "hourly" })).toBeNull();
  });
});

describe("nextOccurrenceDueAt", () => {
  const daily = { frequency: "daily" as const, interval: 1 };
  const weekly = { frequency: "weekly" as const, interval: 1 };

  it("advances one day from the due date", () => {
    const next = nextOccurrenceDueAt(
      new Date("2026-08-10T12:00:00"),
      daily,
      new Date("2026-08-10T18:00:00"),
    );
    expect(next.toISOString().slice(0, 10)).toBe("2026-08-11");
  });

  it("advances one week", () => {
    const from = new Date("2026-08-10T12:00:00");
    const next = addRecurrenceInterval(from, weekly);
    expect(next.toISOString().slice(0, 10)).toBe("2026-08-17");
  });

  it("skips overdue occurrences until today", () => {
    const next = nextOccurrenceDueAt(
      new Date("2026-07-01T12:00:00"),
      weekly,
      new Date("2026-08-14T09:00:00"),
    );
    expect(next.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-08-14T00:00:00").getTime(),
    );
    expect(next.getDay()).toBe(new Date("2026-07-01T12:00:00").getDay());
  });

  it("uses now when the completed task had no due date", () => {
    const now = new Date("2026-08-14T15:00:00");
    const next = nextOccurrenceDueAt(null, daily, now);
    expect(next.toISOString().slice(0, 10)).toBe("2026-08-15");
  });
});

describe("full recurrence rules", () => {
  const zone = "Asia/Kolkata";
  /** An instant from an India-time wall clock. */
  const ist = (value: string) => new Date(`${value}+05:30`);
  const istDay = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(date);
  const istTime = (date: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hour12: false }).format(date);

  it("weekly on chosen weekdays moves to the next chosen day", () => {
    // Mon, Wed, Fri; due Monday 2026-08-10 → Wednesday, then Friday → next Monday.
    const rule = { frequency: "weekly" as const, interval: 1, byWeekday: [1, 3, 5], timeZone: zone };
    const now = ist("2026-08-10T08:00:00");
    const wed = nextOccurrenceDueAt(ist("2026-08-10T09:00:00"), rule, now);
    expect(istDay(wed)).toBe("2026-08-12");
    expect(istDay(nextOccurrenceDueAt(ist("2026-08-14T09:00:00"), rule, now))).toBe("2026-08-17");
  });

  it("every 2 weeks on chosen days skips the week in between", () => {
    const rule = { frequency: "weekly" as const, interval: 2, byWeekday: [1, 3], timeZone: zone };
    const next = nextOccurrenceDueAt(ist("2026-08-12T09:00:00"), rule, ist("2026-08-12T08:00:00"));
    expect(istDay(next)).toBe("2026-08-24");
  });

  it("monthly on the 31st uses the last day of short months, then returns to the 31st", () => {
    const rule = { frequency: "monthly" as const, interval: 1, monthDay: 31, timeZone: zone };
    const now = ist("2026-01-31T08:00:00");
    const feb = nextOccurrenceDueAt(ist("2026-01-31T12:00:00"), rule, now);
    expect(istDay(feb)).toBe("2026-02-28");
    expect(istDay(nextOccurrenceDueAt(feb, rule, now))).toBe("2026-03-31");
  });

  it("yearly on 29 February lands on the 28th in other years", () => {
    const rule = { frequency: "yearly" as const, interval: 1, monthDay: 29, timeZone: zone };
    const next = nextOccurrenceDueAt(ist("2028-02-29T12:00:00"), rule, ist("2028-02-29T08:00:00"));
    expect(istDay(next)).toBe("2029-02-28");
  });

  it("after completion counts from today and keeps the due time", () => {
    const rule = { frequency: "daily" as const, interval: 3, fromCompletion: true, timeZone: zone };
    const next = nextOccurrenceDueAt(ist("2026-08-01T18:30:00"), rule, ist("2026-08-10T10:00:00"));
    expect(istDay(next)).toBe("2026-08-13");
    expect(istTime(next)).toBe("18:30");
  });

  it("counts days in the rule's zone, not the server's", () => {
    // 01:30 on Monday in India is still Sunday in UTC.
    const rule = { frequency: "weekly" as const, interval: 1, byWeekday: [1], timeZone: zone };
    const next = nextOccurrenceDueAt(ist("2026-08-10T01:30:00"), rule, ist("2026-08-10T00:30:00"));
    expect(istDay(next)).toBe("2026-08-17");
    expect(istTime(next)).toBe("01:30");
  });

  it("cleans submitted rules", () => {
    expect(asRecurrenceRule({ frequency: "monthly", interval: 0, monthDay: 40, timeZone: "Not/AZone" })).toEqual({ frequency: "monthly", interval: 1 });
    expect(asRecurrenceRule({ frequency: "weekly", byWeekday: [5, 1, 1, 9], fromCompletion: true, timeZone: zone }))
      .toEqual({ frequency: "weekly", interval: 1, byWeekday: [1, 5], fromCompletion: true, timeZone: zone });
  });
});
