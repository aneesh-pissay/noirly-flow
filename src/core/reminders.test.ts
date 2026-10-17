import { describe, expect, it } from "vitest";
import { describeReminder, reminderAtFor } from "@/src/core/reminders";

describe("reminderAtFor", () => {
  const due = new Date("2026-08-14T10:00:00.000Z");

  it("fires the lead time before a timed due date", () => {
    expect(reminderAtFor(due, true, 30)?.toISOString()).toBe("2026-08-14T09:30:00.000Z");
    expect(reminderAtFor(due, true, 0)?.toISOString()).toBe(due.toISOString());
  });

  it("needs a due time and a lead time", () => {
    expect(reminderAtFor(due, false, 30)).toBeNull();
    expect(reminderAtFor(null, true, 30)).toBeNull();
    expect(reminderAtFor(due, true, null)).toBeNull();
  });
});

describe("describeReminder", () => {
  it("reads naturally", () => {
    expect(describeReminder(0)).toBe("At the due time");
    expect(describeReminder(15)).toBe("15 minutes before");
    expect(describeReminder(60)).toBe("1 hour before");
    expect(describeReminder(120)).toBe("2 hours before");
    expect(describeReminder(1440)).toBe("1 day before");
  });
});
