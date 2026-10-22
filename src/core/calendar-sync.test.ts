import { describe, expect, it } from "vitest";
import { fingerprint, remoteFingerprint, taskPatchFromEvent, taskToEvent, type RemoteEvent, type SyncTask } from "@/src/core/calendar-sync";

const zone = "Asia/Kolkata";
const allDay: SyncTask = { id: "t1", title: "Pay rent", description: "Bank app", dueAt: "2026-10-22T06:30:00.000Z", dueHasTime: false, durationMinutes: null };
const timed: SyncTask = { ...allDay, title: "Call Sam", dueAt: "2026-10-22T09:00:00.000Z", dueHasTime: true, durationMinutes: 45 };

describe("taskToEvent", () => {
  it("makes an all-day event on the task's day in the person's zone", () => {
    const event = taskToEvent(allDay, zone, "https://flow.example/t1");
    expect(event).toMatchObject({ allDay: true, start: "2026-10-22", end: "2026-10-23", title: "Pay rent" });
    expect(event.description).toBe("Bank app\n\nOpen in Noirly Flow: https://flow.example/t1");
    // Late in the UTC day is already tomorrow in Kolkata.
    expect(taskToEvent({ ...allDay, dueAt: "2026-10-22T20:00:00.000Z" }, zone, "u")).toMatchObject({ start: "2026-10-23" });
  });

  it("makes a timed event as long as the estimate (30 minutes without one)", () => {
    expect(taskToEvent(timed, zone, "u")).toMatchObject({ allDay: false, start: "2026-10-22T09:00:00.000Z", end: "2026-10-22T09:45:00.000Z" });
    expect(taskToEvent({ ...timed, durationMinutes: null }, zone, "u").end).toBe("2026-10-22T09:30:00.000Z");
  });
});

describe("fingerprints", () => {
  it("match between what was written and how a calendar reads it back", () => {
    const written = taskToEvent(timed, zone, "u");
    const read: RemoteEvent = { id: "e", deleted: false, title: "Call Sam", allDay: false, start: "2026-10-22T14:30:00+05:30", end: "2026-10-22T15:15:00+05:30", updatedAt: null };
    expect(remoteFingerprint(read)).toBe(fingerprint(written));
    expect(remoteFingerprint({ ...read, title: "Call Sam again" })).not.toBe(fingerprint(written));
  });
});

describe("taskPatchFromEvent", () => {
  it("moves an all-day task to the event's day, at noon in the zone", () => {
    const moved: RemoteEvent = { id: "e", deleted: false, title: "Pay rent", allDay: true, start: "2026-10-25", end: "2026-10-26", updatedAt: null };
    expect(taskPatchFromEvent(moved, allDay, zone)).toEqual({ dueAt: "2026-10-25T06:30:00.000Z" });
  });

  it("reads a retimed, renamed, resized event", () => {
    const edited: RemoteEvent = { id: "e", deleted: false, title: "Call Sam (moved)", allDay: false, start: "2026-10-23T10:00:00.000Z", end: "2026-10-23T11:30:00.000Z", updatedAt: null };
    expect(taskPatchFromEvent(edited, timed, zone)).toEqual({ title: "Call Sam (moved)", dueAt: "2026-10-23T10:00:00.000Z", durationMinutes: 90 });
  });

  it("turns an all-day task timed when its event gets a time, and leaves an unchanged one alone", () => {
    const timedNow: RemoteEvent = { id: "e", deleted: false, title: "Pay rent", allDay: false, start: "2026-10-22T04:00:00.000Z", end: "2026-10-22T04:30:00.000Z", updatedAt: null };
    expect(taskPatchFromEvent(timedNow, allDay, zone)).toEqual({ dueAt: "2026-10-22T04:00:00.000Z", dueHasTime: true });
    const same: RemoteEvent = { id: "e", deleted: false, title: "Call Sam", allDay: false, start: timed.dueAt, end: "2026-10-22T09:45:00.000Z", updatedAt: null };
    expect(taskPatchFromEvent(same, timed, zone)).toEqual({});
  });
});

describe("zone helpers", () => {
  it("convert between days, wall clocks and instants", async () => {
    const { dayInZone, noonOnDay, wallToInstant } = await import("@/src/core/recurrence/next");
    expect(wallToInstant("2026-10-24T09:30:00", "UTC").toISOString()).toBe("2026-10-24T09:30:00.000Z");
    expect(wallToInstant("2026-10-24T09:30:00.0000000", "Asia/Kolkata").toISOString()).toBe("2026-10-24T04:00:00.000Z");
    expect(Number.isNaN(wallToInstant("not a time", "UTC").getTime())).toBe(true);
    expect(noonOnDay("2026-10-24", "Asia/Kolkata").toISOString()).toBe("2026-10-24T06:30:00.000Z");
    expect(dayInZone(new Date("2026-10-24T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-25");
  });
});
