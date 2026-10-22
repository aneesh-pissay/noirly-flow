import { describe, expect, it } from "vitest";
import { csvCell, fileSlug, tasksToCsv, type CsvContext } from "@/src/core/export";
import { DEFAULT_STATUS_NAMES } from "@/src/core/workspace-settings";
import type { Task } from "@/src/core/sync/types";

describe("csvCell", () => {
  it("quotes and escapes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("defuses formulas in text but not numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1 call")).toBe("'+1 call");
    expect(csvCell("@here")).toBe("'@here");
    expect(csvCell(-5)).toBe("-5");
  });
});

describe("tasksToCsv", () => {
  const task = {
    id: "t1", title: "Ship it", projectId: "p1", sectionId: "s1", status: "done", priority: "high",
    dueAt: "2026-10-22T06:30:00.000Z", dueHasTime: false, startAt: null, deadlineAt: null, durationMinutes: 30,
    assigneeIds: ["u1", "u9"], tagIds: ["g1"], goalId: null, parentTaskId: null,
    createdAt: "2026-10-01T00:00:00.000Z", completedAt: "2026-10-21T00:00:00.000Z", description: "Notes",
    fieldValues: { f1: "o2" },
  } as unknown as Task;
  const context: CsvContext = {
    projects: new Map([["p1", "Launch"]]), sections: new Map([["s1", "Week 1"]]), tags: new Map([["g1", "urgent"]]),
    people: new Map([["u1", "Sam"]]), goals: new Map(), statusNames: { ...DEFAULT_STATUS_NAMES, done: "Shipped" },
    fields: [{ id: "f1", projectId: "p1", name: "Size", type: "select", options: [{ id: "o2", name: "Large" }], position: 0 }],
  };

  it("writes one row per task with names, not ids", () => {
    const [header, row] = tasksToCsv([task], context).replace("﻿", "").trim().split("\r\n");
    expect(header).toContain("Field: Size");
    expect(row).toBe("t1,Ship it,Launch,Week 1,Shipped,high,2026-10-22,,,30,Sam; Former member,urgent,,,2026-10-01T00:00:00.000Z,2026-10-21T00:00:00.000Z,Notes,Large");
  });

  it("starts with a byte-order mark", () => {
    expect(tasksToCsv([], context).startsWith("﻿ID,Title")).toBe(true);
  });
});

describe("fileSlug", () => {
  it("makes safe file names", () => {
    expect(fileSlug("Team Alpha / Ops")).toBe("team-alpha-ops");
    expect(fileSlug("🚀")).toBe("workspace");
  });
});
