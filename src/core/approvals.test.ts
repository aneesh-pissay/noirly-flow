import { describe, expect, it } from "vitest";
import { approvalActions, blocksCompletion, type Approval } from "@/src/core/approvals";

const approval = (status: Approval["status"]): Approval => ({
  status, requestedById: "req", approverId: "app", requestedAt: "2026-10-19T00:00:00.000Z", decidedAt: null, note: null,
});

describe("approvalActions", () => {
  it("lets writers request when there's none", () => {
    expect(approvalActions(null, "x", "member")).toEqual({ request: true, decide: false, withdraw: false });
    expect(approvalActions(null, "x", "viewer").request).toBe(false);
  });

  it("lets only the approver decide a pending one", () => {
    expect(approvalActions(approval("pending"), "app", "member").decide).toBe(true);
    expect(approvalActions(approval("pending"), "req", "owner").decide).toBe(false);
    expect(approvalActions(approval("approved"), "app", "member").decide).toBe(false);
  });

  it("lets the requester or an admin withdraw, and anyone writing re-request once decided", () => {
    expect(approvalActions(approval("pending"), "req", "member").withdraw).toBe(true);
    expect(approvalActions(approval("pending"), "other", "member").withdraw).toBe(false);
    expect(approvalActions(approval("pending"), "other", "admin").withdraw).toBe(true);
    expect(approvalActions(approval("pending"), "req", "member").request).toBe(false);
    expect(approvalActions(approval("rejected"), "other", "member").request).toBe(true);
  });
});

describe("blocksCompletion", () => {
  it("blocks until approved", () => {
    expect(blocksCompletion(null)).toBe(false);
    expect(blocksCompletion(approval("pending"))).toBe(true);
    expect(blocksCompletion(approval("rejected"))).toBe(true);
    expect(blocksCompletion(approval("approved"))).toBe(false);
  });
});
