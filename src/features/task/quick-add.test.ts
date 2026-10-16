import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "@/src/features/task/quick-add";

// Friday 14 August 2026, 10:00 local time.
const now = new Date(2026, 7, 14, 10, 0);
const projects = [{ id: "p-home", name: "Home" }, { id: "p-office", name: "Home Office" }, { id: "p-work", name: "Work" }];
const parse = (text: string) => parseQuickAdd(text, { now, projects, timeZone: "Asia/Kolkata" });

describe("parseQuickAdd", () => {
  it("handles the roadmap example", () => {
    const result = parse("Pay rent every 1st 9am p1 #Home");
    expect(result.title).toBe("Pay rent");
    expect(result.projectId).toBe("p-home");
    expect(result.priority).toBe("high");
    expect(result.dueTime).toBe("09:00");
    expect(result.dueDate).toBe("2026-09-01");
    expect(result.recurrence).toEqual({ frequency: "monthly", interval: 1, monthDay: 1, timeZone: "Asia/Kolkata" });
  });

  it("leaves plain titles alone", () => {
    const result = parse("Buy sun cream and 2 apples in May");
    expect(result).toEqual({ title: "Buy sun cream and 2 apples in May", labels: [] });
  });

  it("reads relative days and drops lead-in words", () => {
    expect(parse("Call mum tomorrow at 5pm")).toMatchObject({ title: "Call mum", dueDate: "2026-08-15", dueTime: "17:00" });
    expect(parse("Submit report by friday")).toMatchObject({ title: "Submit report", dueDate: "2026-08-21" });
    expect(parse("Renew passport in 3 weeks")).toMatchObject({ title: "Renew passport", dueDate: "2026-09-04" });
    expect(parse("Plan sprint next week")).toMatchObject({ title: "Plan sprint", dueDate: "2026-08-17" });
  });

  it("reads month-day dates, rolling into next year once passed", () => {
    expect(parse("Dentist aug 20")).toMatchObject({ title: "Dentist", dueDate: "2026-08-20" });
    expect(parse("Tax 31st July")).toMatchObject({ title: "Tax", dueDate: "2027-07-31" });
    expect(parse("Launch 2026-12-01")).toMatchObject({ title: "Launch", dueDate: "2026-12-01" });
  });

  it("puts a time alone today, or tomorrow once it has passed", () => {
    expect(parse("Standup 11:30")).toMatchObject({ title: "Standup", dueDate: "2026-08-14", dueTime: "11:30" });
    expect(parse("Gym 7am")).toMatchObject({ title: "Gym", dueDate: "2026-08-15", dueTime: "07:00" });
  });

  it("reads repeats and starts them on their first day", () => {
    expect(parse("Water plants every mon and thu")).toMatchObject({
      title: "Water plants", dueDate: "2026-08-17",
      recurrence: { frequency: "weekly", byWeekday: [1, 4] },
    });
    expect(parse("Timesheet every weekday 6pm")).toMatchObject({
      title: "Timesheet", dueDate: "2026-08-14", dueTime: "18:00",
      recurrence: { frequency: "weekly", byWeekday: [1, 2, 3, 4, 5] },
    });
    expect(parse("Backup every 2 weeks after completion")).toMatchObject({
      title: "Backup", dueDate: "2026-08-14",
      recurrence: { frequency: "weekly", interval: 2, fromCompletion: true },
    });
    expect(parse("Anniversary every oct 3")).toMatchObject({
      title: "Anniversary", dueDate: "2026-10-03", recurrence: { frequency: "yearly", monthDay: 3 },
    });
  });

  it("matches the longest project name, and #inbox", () => {
    expect(parse("Fix desk #home office")).toMatchObject({ title: "Fix desk", projectId: "p-office" });
    expect(parse("Triage #inbox")).toMatchObject({ title: "Triage", projectId: null });
    expect(parse("Tweet #launch")).toMatchObject({ title: "Tweet #launch" });
  });

  it("keeps the typed text when everything was a keyword", () => {
    expect(parse("tomorrow").title).toBe("tomorrow");
  });
});
