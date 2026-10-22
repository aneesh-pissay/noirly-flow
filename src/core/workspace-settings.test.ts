import { describe, expect, it } from "vitest";
import { checkStatusNames, isWorkspaceIcon, statusNamesFor, workspaceInitial } from "@/src/core/workspace-settings";

describe("status names", () => {
  it("falls back to the defaults for blanks", () => {
    expect(statusNamesFor({ todo: "Backlog", done: "  ", in_progress: null })).toEqual({
      todo: "Backlog", in_progress: "In progress", done: "Done", canceled: "Canceled",
    });
    expect(statusNamesFor(null).todo).toBe("Todo");
  });

  it("needs short, different names", () => {
    expect(checkStatusNames({ todo: "Backlog", done: "Shipped" })).toBeNull();
    expect(checkStatusNames({ todo: "Done" })).toBe("Each status needs a different name");
    expect(checkStatusNames({ todo: "done" })).toBe("Each status needs a different name");
    expect(checkStatusNames({ todo: "x".repeat(25) })).toContain("too long");
  });
});

describe("icons", () => {
  it("takes exactly one emoji", () => {
    expect(isWorkspaceIcon("🚀")).toBe(true);
    expect(isWorkspaceIcon("👩🏽‍💻")).toBe(true);
    expect(isWorkspaceIcon("🇮🇳")).toBe(false); // flags aren't pictographic
    expect(isWorkspaceIcon("🚀🚀")).toBe(false);
    expect(isWorkspaceIcon("A")).toBe(false);
    expect(isWorkspaceIcon("")).toBe(false);
  });

  it("falls back to the first letter", () => {
    expect(workspaceInitial("  noirly team")).toBe("N");
    expect(workspaceInitial("")).toBe("?");
  });
});
