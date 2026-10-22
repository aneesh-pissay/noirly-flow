import { describe, expect, it } from "vitest";
import { checkFieldValue, formatFieldValue, type FieldType, type ProjectField } from "@/src/core/custom-fields";

const field = (type: FieldType, options: ProjectField["options"] = []): ProjectField =>
  ({ id: "f", projectId: "p", name: "Field", type, options, position: 0 });
const members = new Set(["u1"]);

describe("checkFieldValue", () => {
  it("clears on null or empty", () => {
    expect(checkFieldValue(field("number"), null, members)).toEqual({ ok: true, value: null });
    expect(checkFieldValue(field("text"), "  ", members)).toEqual({ ok: true, value: null });
  });

  it("checks each type", () => {
    expect(checkFieldValue(field("text"), " hi ", members)).toEqual({ ok: true, value: "hi" });
    expect(checkFieldValue(field("text"), "x".repeat(501), members).ok).toBe(false);
    expect(checkFieldValue(field("number"), 3.5, members)).toEqual({ ok: true, value: 3.5 });
    expect(checkFieldValue(field("number"), "3", members).ok).toBe(false);
    expect(checkFieldValue(field("number"), Number.NaN, members).ok).toBe(false);
    const select = field("select", [{ id: "o1", name: "High" }]);
    expect(checkFieldValue(select, "o1", members)).toEqual({ ok: true, value: "o1" });
    expect(checkFieldValue(select, "o2", members)).toEqual({ ok: false, error: "Field: not one of its options" });
    expect(checkFieldValue(field("date"), "2026-10-19T06:30:00.000Z", members)).toEqual({ ok: true, value: "2026-10-19T06:30:00.000Z" });
    expect(checkFieldValue(field("date"), "tomorrow", members).ok).toBe(false);
    expect(checkFieldValue(field("person"), "u1", members)).toEqual({ ok: true, value: "u1" });
    expect(checkFieldValue(field("person"), "u2", members).ok).toBe(false);
  });
});

describe("formatFieldValue", () => {
  it("reads values back for display", () => {
    const names = new Map([["u1", "Sam"]]);
    expect(formatFieldValue(field("select", [{ id: "o1", name: "High" }]), "o1", names)).toBe("High");
    expect(formatFieldValue(field("select", []), "gone", names)).toBeNull();
    expect(formatFieldValue(field("person"), "u1", names)).toBe("Sam");
    expect(formatFieldValue(field("person"), "u9", names)).toBe("Former member");
    expect(formatFieldValue(field("text"), undefined, names)).toBeNull();
    expect(formatFieldValue(field("number"), 1200, names)).toBe(new Intl.NumberFormat().format(1200));
  });
});
