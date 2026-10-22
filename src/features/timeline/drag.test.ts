import { describe, expect, it } from "vitest";
import { blockDuration, dropToIso, minutesAt, movedStart, resizedDuration, snap } from "@/src/features/timeline/drag";

describe("timeline drag maths", () => {
  it("snaps to 15 minutes", () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(15);
    expect(snap(52)).toBe(45);
  });

  it("turns pixels into minutes", () => {
    expect(minutesAt(72, 48)).toBe(90);
  });

  it("keeps a moved block inside the day, keeping where it was grabbed", () => {
    expect(movedStart(600, 20, 60)).toBe(585);
    expect(movedStart(-30, 0, 60)).toBe(0);
    expect(movedStart(1430, 0, 60)).toBe(1380);
  });

  it("resizes to at least 15 minutes and no further than midnight", () => {
    expect(resizedDuration(540, 545)).toBe(15);
    expect(resizedDuration(540, 628)).toBe(90);
    expect(resizedDuration(1380, 1500)).toBe(60);
  });

  it("uses 30 minutes when a task has no duration", () => {
    expect(blockDuration(null)).toBe(30);
    expect(blockDuration(45)).toBe(45);
  });

  it("saves the local day and time", () => {
    const iso = dropToIso(new Date(2026, 7, 14), 9 * 60 + 15);
    const date = new Date(iso);
    expect([date.getDate(), date.getHours(), date.getMinutes()]).toEqual([14, 9, 15]);
  });
});
