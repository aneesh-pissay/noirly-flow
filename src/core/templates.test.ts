import { describe, expect, it } from "vitest";
import { countTemplateTasks } from "@/src/core/templates";

describe("countTemplateTasks", () => {
  it("counts every task, subtasks at any depth included", () => {
    expect(countTemplateTasks([])).toBe(0);
    expect(countTemplateTasks([
      { title: "Launch", subtasks: [{ title: "Copy", subtasks: [{ title: "Proofread" }] }, { title: "Assets" }] },
      { title: "Retro" },
    ])).toBe(5);
  });
});
