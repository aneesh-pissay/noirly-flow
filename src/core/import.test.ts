import { describe, expect, it } from "vitest";
import { guessMapping, isTodoistCsv, parseCsv, planFromCsv, planFromTodoist, type DateReader } from "@/src/core/import";

const readDate: DateReader = (text) => (text === "tomorrow" ? { dueAt: "2026-10-23T06:30:00.000Z", dueHasTime: false, recurrence: null }
  : text === "every monday" ? { dueAt: "2026-10-26T06:30:00.000Z", dueHasTime: false, recurrence: { frequency: "weekly", interval: 1, byWeekday: [1] } as never }
  : null);

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, newlines, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"two\nlines",\n\n')).toEqual([
      ["a", "b"], ["x, y", 'say "hi"'], ["two\nlines", ""],
    ]);
  });
});

describe("Todoist", () => {
  const csv = [
    "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE",
    "section,Planning,,,,,,,,",
    "task,Write brief @work,Two pages,1,1,Sam,,tomorrow,en,",
    "note,Ask Priya first,,,,,,,,",
    "task,Collect quotes,,4,2,Sam,pat@example.com,every monday,en,",
    "task,Book venue,,2,1,Sam,,someday soon,en,",
    "section,Later,,,,,,,,",
    "task,Retro,,,1,,,,en,",
  ].join("\n");
  const rows = parseCsv(csv);

  it("is recognised by its columns", () => {
    expect(isTodoistCsv(rows[0]!)).toBe(true);
    expect(isTodoistCsv(["Title", "Due"])).toBe(false);
  });

  it("keeps sections, subtasks, notes, labels, priorities and dates", () => {
    const plan = planFromTodoist(rows, readDate);
    expect(plan.sections).toEqual(["Planning", "Later"]);
    expect(plan.tasks.map((t) => [t.title, t.sectionName, t.parent, t.priority])).toEqual([
      ["Write brief", "Planning", null, "high"],
      ["Collect quotes", "Planning", 0, "none"],
      ["Book venue", "Planning", null, "medium"],
      ["Retro", "Later", null, "none"],
    ]);
    expect(plan.tasks[0]).toMatchObject({ tagNames: ["work"], description: "Two pages", comments: ["Ask Priya first"], dueAt: "2026-10-23T06:30:00.000Z" });
    expect(plan.tasks[1]).toMatchObject({ assigneeEmail: "pat@example.com", recurrence: { frequency: "weekly" } });
    expect(plan.warnings).toEqual(["Couldn't read the date “someday soon” on “Book venue”; it was left off."]);
  });
});

describe("generic CSV", () => {
  it("guesses columns from their names", () => {
    expect(guessMapping(["Task Name", "Name", "Notes", "Due Date", "Labels", "Status", "List"])).toEqual({
      title: 1, description: 2, due: 3, tags: 4, status: 5, section: 6,
    });
  });

  it("reads rows through the mapping", () => {
    const rows = parseCsv("Name,Due,Priority,Status,Tags\nPay rent,tomorrow,High,Done,\"home, #bills\"\n,tomorrow,,,\nCall bank,,whatever,open,");
    const plan = planFromCsv(rows, guessMapping(rows[0]!), readDate);
    expect(plan.tasks).toHaveLength(2);
    expect(plan.tasks[0]).toMatchObject({ title: "Pay rent", priority: "high", done: true, tagNames: ["home", "bills"], dueAt: "2026-10-23T06:30:00.000Z" });
    expect(plan.tasks[1]).toMatchObject({ title: "Call bank", priority: "none", done: false });
    expect(plan.warnings).toEqual(["1 row without a title was skipped."]);
  });
});
