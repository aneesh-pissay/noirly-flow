import { describe, expect, it } from "vitest";
import { buildCalendar, dateInZone, escapeText, foldLine } from "@/src/server/calendar/ics";

describe("escapeText", () => {
  it("escapes the characters RFC 5545 reserves", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
});

describe("foldLine", () => {
  it("leaves short lines alone", () => {
    expect(foldLine("SUMMARY:short")).toBe("SUMMARY:short");
  });

  it("folds at 75 octets without splitting multi-byte characters", () => {
    const folded = foldLine(`SUMMARY:${"é".repeat(60)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(lines.slice(1).every((line) => line.startsWith(" "))).toBe(true);
    expect(lines.map((line, i) => (i ? line.slice(1) : line)).join("")).toBe(`SUMMARY:${"é".repeat(60)}`);
  });
});

describe("dateInZone", () => {
  // Flow stores a due date as noon local time.
  const kolkataNoon = new Date("2026-10-20T06:30:00.000Z");
  it("uses the person's time zone", () => {
    expect(dateInZone(kolkataNoon, "Asia/Kolkata")).toBe("20261020");
    expect(dateInZone(new Date("2026-10-20T19:00:00.000Z"), "America/Los_Angeles")).toBe("20261020");
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(dateInZone(kolkataNoon, "Not/AZone")).toBe("20261020");
  });
});

describe("buildCalendar", () => {
  it("writes one all-day event per task", () => {
    const ics = buildCalendar({
      name: "Noirly Flow",
      timeZone: "Asia/Kolkata",
      host: "flow.example",
      tasks: [{
        id: "t1",
        title: "Pay rent, today",
        description: null,
        dueAt: new Date("2026-12-31T06:30:00.000Z"),
        hasTime: false,
        done: true,
        updatedAt: new Date("2026-10-14T10:00:00.000Z"),
        where: "Home · Personal",
        url: "https://flow.example/w/1/inbox?task=t1",
      }],
    });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:t1@flow.example");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
    expect(ics).toContain("SUMMARY:✓ Pay rent\\, today");
    expect(ics).toContain("DTSTAMP:20261014T100000Z");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("writes a timed event, in UTC, when the task has a due time", () => {
    const ics = buildCalendar({
      name: "Noirly Flow",
      timeZone: "Asia/Kolkata",
      host: "flow.example",
      tasks: [{
        id: "t2",
        title: "Call the bank",
        description: null,
        dueAt: new Date("2026-12-31T09:30:00.000Z"),
        hasTime: true,
        done: false,
        updatedAt: new Date("2026-10-14T10:00:00.000Z"),
        where: "Inbox · Personal",
        url: "https://flow.example/w/1/inbox?task=t2",
      }],
    });
    expect(ics).toContain("DTSTART:20261231T093000Z");
    expect(ics).toContain("DTEND:20261231T100000Z");
    expect(ics).not.toContain("VALUE=DATE");
  });

  it("makes a timed event as long as the task's duration", () => {
    const ics = buildCalendar({
      name: "Noirly Flow",
      timeZone: "Asia/Kolkata",
      host: "flow.example",
      tasks: [{
        id: "t3",
        title: "Deep work",
        description: null,
        dueAt: new Date("2026-12-31T09:30:00.000Z"),
        hasTime: true,
        durationMinutes: 90,
        done: false,
        updatedAt: new Date("2026-10-14T10:00:00.000Z"),
        where: "Inbox · Personal",
        url: "https://flow.example/w/1/inbox?task=t3",
      }],
    });
    expect(ics).toContain("DTEND:20261231T110000Z");
  });
});
