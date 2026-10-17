import { describe, expect, it } from "vitest";
import type { Section, Task } from "@/src/core/sync/types";
import { groupBySection } from "@/src/features/task/ProjectSections";

const task = (id: string, sectionId: string | null) => ({ id, sectionId }) as Task;
const sections: Section[] = [
  { id: "a", projectId: "p", name: "Backlog", position: 1000 },
  { id: "b", projectId: "p", name: "Doing", position: 2000 },
];
const shape = (groups: ReturnType<typeof groupBySection>) =>
  groups.map((g) => [g.section?.id ?? "none", g.tasks.map((t) => t.id)]);

describe("groupBySection", () => {
  it("puts loose tasks first, then every section in order, empty ones too", () => {
    expect(shape(groupBySection([task("1", "b"), task("2", null), task("3", "a")], sections)))
      .toEqual([["none", ["2"]], ["a", ["3"]], ["b", ["1"]]]);
  });

  it("drops an empty No section when there are sections, and keeps it when there are none", () => {
    expect(shape(groupBySection([task("1", "a")], sections))).toEqual([["a", ["1"]], ["b", []]]);
    expect(shape(groupBySection([], []))).toEqual([["none", []]]);
  });

  it("treats a task in a deleted section as having none", () => {
    expect(shape(groupBySection([task("1", "gone")], sections))).toEqual([["none", ["1"]], ["a", []], ["b", []]]);
  });
});
