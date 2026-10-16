import { createConnection } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Space sync against a real MongoDB (the one e2e uses). Identity is faked:
 * each test says what the space looks like. Skipped when Mongo isn't running.
 */

const fakeSpace = vi.hoisted(() => ({ current: null as null | { id: string; name: string; members: unknown[] } }));

vi.mock("@/src/server/spaces/identity-spaces", () => {
  class SpaceGoneError extends Error {}
  return {
    SpaceGoneError,
    fetchSpace: async () => {
      if (!fakeSpace.current) throw new SpaceGoneError("gone");
      return fakeSpace.current;
    },
  };
});

// members.ts reaches Auth.js through api/http; nothing here needs a session.
vi.mock("@/auth", () => ({ auth: async () => null }));

const MONGO = "mongodb://127.0.0.1:27017";
const mongoUp = await new Promise<boolean>((resolve) => {
  const url = new URL(MONGO.replace(/^mongodb:/, "http:"));
  const socket = createConnection({ host: url.hostname, port: Number(url.port || 27017) });
  socket.setTimeout(500);
  socket.once("connect", () => (socket.destroy(), resolve(true)));
  socket.once("error", () => resolve(false));
  socket.once("timeout", () => (socket.destroy(), resolve(false)));
});

describe.skipIf(!mongoUp)("space sync", () => {
  let mongoose: typeof import("mongoose").default;
  let models: typeof import("@/src/server/models");
  let sync: typeof import("@/src/server/spaces/sync");
  let members: typeof import("@/src/server/workspace/members");

  beforeAll(async () => {
    process.env.MONGODB_URI = `${MONGO}/noirly-flow-unit-spaces-${process.pid}`;
    mongoose = (await import("mongoose")).default;
    models = await import("@/src/server/models");
    sync = await import("@/src/server/spaces/sync");
    members = await import("@/src/server/workspace/members");
    const { connectMongo } = await import("@/src/server/db/mongodb");
    await connectMongo();
  });

  afterAll(async () => {
    await mongoose?.connection.db?.dropDatabase();
    await mongoose?.disconnect();
  });

  let n = 0;
  const sub = () => (++n).toString(16).padStart(24, "a");
  async function person(name: string) {
    const identitySub = sub();
    const user = await models.FlowUser.create({
      identitySub,
      email: `${name}-${identitySub}@test.dev`,
      displayName: name,
    });
    return { id: user._id, sub: identitySub, email: user.email, name };
  }
  type Person = Awaited<ReturnType<typeof person>>;
  const asMember = (p: Person, role: string) => ({ userId: p.sub, email: p.email, displayName: p.name, role });

  async function team(owner: Person, others: Array<[Person, string]>, spaceId: string | null = sub()) {
    const workspace = await models.Workspace.create({
      kind: "team",
      name: "Team",
      slug: `team-${sub()}`,
      ownerUserId: owner.id,
      spaceId,
      spaceName: spaceId ? "Old name" : null,
    });
    await models.WorkspaceMembership.create([
      { workspaceId: workspace._id, userId: owner.id, role: "owner" },
      ...others.map(([p, role]) => ({ workspaceId: workspace._id, userId: p.id, role: role as "member" })),
    ]);
    return workspace;
  }
  async function rolesOf(workspaceId: import("mongoose").Types.ObjectId) {
    const rows = await models.WorkspaceMembership.find({ workspaceId }).lean();
    return Object.fromEntries(rows.map((row) => [String(row.userId), row.role]));
  }

  beforeEach(() => {
    fakeSpace.current = null;
  });

  it("makes the team's members match the space", async () => {
    const [ann, ben, cat] = [await person("ann"), await person("ben"), await person("cat")];
    const workspace = await team(ann, [[ben, "member"], [cat, "viewer"]]);
    const dee = { sub: sub(), email: "dee@test.dev", name: "Dee" };
    fakeSpace.current = {
      id: workspace.spaceId!,
      name: "Goa Trip",
      members: [asMember(ann, "owner"), asMember(ben, "admin"), { userId: dee.sub, email: dee.email, displayName: "Dee", role: "member" }],
    };

    const result = await sync.syncWorkspaceWithSpace(String(workspace._id));
    expect(result).toEqual({ status: "synced", added: 1, removed: 1, changed: 1, skipped: 0 });

    const deeUser = await models.FlowUser.findOne({ identitySub: dee.sub }).lean();
    expect(deeUser?.email).toBe("dee@test.dev");
    expect(await rolesOf(workspace._id)).toEqual({
      [String(ann.id)]: "owner",
      [String(ben.id)]: "admin",
      [String(deeUser!._id)]: "member",
    });
    const after = await models.Workspace.findById(workspace._id).lean();
    expect(after?.spaceName).toBe("Goa Trip");
    expect(after?.spaceSyncedAt).toBeInstanceOf(Date);

    // A second sync with no changes changes nothing.
    expect(await sync.syncWorkspaceWithSpace(String(workspace._id))).toEqual({
      status: "synced", added: 0, removed: 0, changed: 0, skipped: 0,
    });
  });

  it("moves the recorded owner when they're no longer an owner in the space", async () => {
    const [ann, ben] = [await person("ann"), await person("ben")];
    const workspace = await team(ann, [[ben, "member"]]);
    fakeSpace.current = { id: workspace.spaceId!, name: "S", members: [asMember(ann, "member"), asMember(ben, "owner")] };
    await sync.syncWorkspaceWithSpace(String(workspace._id));
    const after = await models.Workspace.findById(workspace._id).lean();
    expect(String(after?.ownerUserId)).toBe(String(ben.id));
  });

  it("unlinks and keeps the members when the space is gone", async () => {
    const [ann, ben] = [await person("ann"), await person("ben")];
    const workspace = await team(ann, [[ben, "member"]]);
    fakeSpace.current = null;
    expect(await sync.syncWorkspaceWithSpace(String(workspace._id))).toEqual({ status: "unlinked" });
    const after = await models.Workspace.findById(workspace._id).lean();
    expect(after?.spaceId).toBeNull();
    expect(Object.keys(await rolesOf(workspace._id))).toHaveLength(2);
  });

  it("never empties a team on an empty member list", async () => {
    const ann = await person("ann");
    const workspace = await team(ann, []);
    await expect(
      sync.applySpace(workspace._id, { id: workspace.spaceId!, name: "S", members: [] }),
    ).rejects.toThrow();
    expect(Object.keys(await rolesOf(workspace._id))).toHaveLength(1);
  });

  it("turns off Flow's own member management while linked", async () => {
    const [ann, ben] = [await person("ann"), await person("ben")];
    const linked = await team(ann, [[ben, "member"]]);
    const id = String(linked._id);
    const actor = String(ann.id);
    await expect(members.createInvite({ workspaceId: id, userId: actor, role: "member" })).rejects.toMatchObject({ status: 409 });
    await expect(members.removeMember({ actorId: actor, workspaceId: id, targetUserId: String(ben.id) })).rejects.toMatchObject({ status: 409 });
    await expect(
      members.updateMemberRole({ actorId: actor, workspaceId: id, targetUserId: String(ben.id), role: "admin" }),
    ).rejects.toMatchObject({ status: 409 });

    const unlinked = await team(ann, [[ben, "member"]], null);
    await expect(members.createInvite({ workspaceId: String(unlinked._id), userId: actor, role: "member" })).resolves.toHaveProperty("token");
  });
});
