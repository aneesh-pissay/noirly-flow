import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { PATCH as updateTask } from "@/app/api/tasks/[taskId]/route";
import { POST as reorderTasks } from "@/app/api/projects/[projectId]/reorder/route";
import { GET as listTasks } from "@/app/api/workspaces/[workspaceId]/tasks/route";
import { getSyncProvider } from "@/src/server/api/http";
import { searchWorkspaceContent } from "@/src/server/search";
import { Task, Workspace, WorkspaceMembership } from "@/src/server/models";
import {
  acceptInviteBodySchema, createTaskBodySchema, updateMeBodySchema,
  updateTaskBodySchema,
} from "@/src/server/api/schemas";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/src/server/api/http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/src/server/api/http")>(),
  getSyncProvider: vi.fn(),
}));
vi.mock("@/src/server/db/mongodb", () => ({
  withDb: async <T>(fn: () => Promise<T>) => fn(),
}));
vi.mock("@/src/server/realtime/publish", () => ({ publishRealtime: vi.fn() }));
vi.mock("@/src/server/mail/schedule-task-emails", () => ({ scheduleTaskEmails: vi.fn() }));

const id = "507f1f77bcf86cd799439011";
const operators = [{ $ne: null }, { $gt: "" }, { $regex: ".*" }, { $in: [id] }];
const sync = { updateTask: vi.fn(), reorderTasks: vi.fn(), listTasks: vi.fn() };

function request(body: unknown) {
  return new Request("http://localhost:3002/api/tasks/test", {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSyncProvider).mockResolvedValue({
    ctx: { userId: id, identitySub: "test-sub", email: "test@example.com", displayName: "Test" },
    sync, personal: null,
  } as unknown as Awaited<ReturnType<typeof getSyncProvider>>);
});
afterEach(() => vi.restoreAllMocks());

describe("Flow web/mobile shared HTTP boundaries", () => {
  for (const field of ["title", "projectId", "status", "priority", "parentTaskId"]) {
    it.each(operators)(`rejects an operator in task ${field}: %j`, async (value) => {
      const response = await updateTask(request({ [field]: value }), {
        params: Promise.resolve({ taskId: id }),
      });
      expect(response.status).toBe(400);
      expect(sync.updateTask).not.toHaveBeenCalled();
    });
  }

  it("rejects raw update operators and update pipelines", async () => {
    for (const body of [{ $set: { title: "injected" } }, [{ $set: { title: "injected" } }]]) {
      const response = await updateTask(request(body), { params: Promise.resolve({ taskId: id }) });
      expect(response.status).toBe(400);
    }
    expect(sync.updateTask).not.toHaveBeenCalled();
  });

  it("removes injected operators before passing a legitimate patch to the provider", async () => {
    sync.updateTask.mockResolvedValue({ id, title: "Allowed", projectId: null });
    const response = await updateTask(request({
      title: "Allowed", $unset: { workspaceId: "" }, workspaceId: "another-workspace",
    }), { params: Promise.resolve({ taskId: id }) });
    expect(response.status).toBe(200);
    expect(sync.updateTask).toHaveBeenCalledWith(id, { title: "Allowed", checklist: undefined });
  });

  it.each(operators)("rejects operators in bulk task identifiers: %j", async (taskId) => {
    const response = await reorderTasks(request({
      moves: [{ taskId, columnId: null, position: 1000 }],
    }), { params: Promise.resolve({ projectId: id }) });
    expect(response.status).toBe(400);
    expect(sync.reorderTasks).not.toHaveBeenCalled();
  });

  it("keeps JSON-looking status filters as strings and ignores bracket operators", async () => {
    sync.listTasks.mockResolvedValue([]);
    const query = new URLSearchParams({ status: '{"$ne":"done"}', "projectId[$ne]": "x" });
    const response = await listTasks(new Request(`http://localhost:3002/api/tasks?${query}`), {
      params: Promise.resolve({ workspaceId: id }),
    });
    expect(response.status).toBe(200);
    expect(sync.listTasks).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: id, projectId: undefined, status: ['{"$ne":"done"}'],
    }));
  });

  it.each(operators)("rejects nested operators in create, invite, assignment and profile schemas: %j", (value) => {
    expect(createTaskBodySchema.safeParse({ title: "Task", projectId: value }).success).toBe(false);
    expect(acceptInviteBodySchema.safeParse({ token: value }).success).toBe(false);
    expect(updateTaskBodySchema.safeParse({ assigneeIds: [value] }).success).toBe(false);
    expect(updateMeBodySchema.safeParse({ profile: { displayName: value } }).success).toBe(false);
  });
});

describe("MongoDB search query construction", () => {
  it.each([".*", "(a+)+$", '{"$ne":null}', "$where", "[a-z]"])(
    "searches literally for %s and retains the membership restriction",
    async (input) => {
      const workspaceId = new Types.ObjectId(id);
      vi.spyOn(WorkspaceMembership, "find").mockReturnValue({
        lean: async () => [{ workspaceId }],
      } as never);
      const workspaceFind = vi.spyOn(Workspace, "find").mockReturnValue({
        limit: () => ({ lean: async () => [] }),
      } as never);
      const taskFind = vi.spyOn(Task, "find").mockReturnValue({
        sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      } as never);
      await searchWorkspaceContent(id, input);
      const filter = taskFind.mock.calls[0][0] as unknown as { title: RegExp };
      expect(filter.title.test(input)).toBe(true);
      expect(filter.title.test("unrelated task title")).toBe(false);
      expect(taskFind).toHaveBeenCalledWith(expect.objectContaining({
        workspaceId: { $in: [workspaceId] }, deletedAt: null,
      }));
      expect(workspaceFind).toHaveBeenCalledWith(expect.objectContaining({
        _id: { $in: [workspaceId] },
      }));
    },
  );
});
