import { withDb } from "@/src/server/db/mongodb";
import {
  BoardColumn,
  FlowUser,
  Project,
  Workspace,
  WorkspaceMembership,
  type FlowUserDocument,
  type WorkspaceDocument,
} from "@/src/server/models";

export type BootstrapSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

export type BootstrappedAccount = {
  user: {
    id: string;
    identitySub: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
  personalWorkspace: {
    id: string;
    name: string;
    slug: string;
    kind: "personal";
  };
  defaultProject: {
    id: string;
    name: string;
  } | null;
};

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || "workspace";
}

/** MongoDB duplicate-key error: a unique index rejected the write. */
function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}

async function ensurePersonalWorkspace(
  user: FlowUserDocument,
): Promise<{
  workspace: WorkspaceDocument;
  projectId: string | null;
  projectName: string | null;
}> {
  const findPersonal = () =>
    Workspace.findOne({ ownerUserId: user._id, kind: "personal" });

  const existing = await findPersonal();
  if (existing) {
    // Hot path: do not look up the default project on every nav hop.
    // Callers that need it can load projects via the workspace API.
    return { workspace: existing, projectId: null, projectName: null };
  }

  // First login. Concurrent first requests all get here; the unique
  // "one_personal_workspace_per_owner" index lets exactly one create succeed,
  // and the rest adopt the winner's workspace instead of making their own.
  const slugBase = slugify(`${user.displayName}-personal`);
  let workspace: WorkspaceDocument;
  for (let attempt = 0; ; attempt += 1) {
    let slug = slugBase;
    let n = 0;
    while (await Workspace.exists({ slug })) {
      n += 1;
      slug = `${slugBase}-${n}`;
    }

    try {
      workspace = await Workspace.create({
        kind: "personal",
        name: "Personal",
        slug,
        ownerUserId: user._id,
      });
      break;
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt >= 5) throw error;
      const winner = await findPersonal();
      if (winner) {
        return { workspace: winner, projectId: null, projectName: null };
      }
      // Otherwise another user took the slug in the meantime — rescan.
    }
  }

  await WorkspaceMembership.create({
    workspaceId: workspace._id,
    userId: user._id,
    role: "owner",
  });

  const project = await Project.create({
    workspaceId: workspace._id,
    name: "Inbox board",
    description: "Your default personal project",
    defaultView: "board",
  });

  await BoardColumn.insertMany([
    {
      projectId: project._id,
      name: "Todo",
      statusMapped: "todo",
      position: 1000,
    },
    {
      projectId: project._id,
      name: "In progress",
      statusMapped: "in_progress",
      position: 2000,
    },
    {
      projectId: project._id,
      name: "Done",
      statusMapped: "done",
      position: 3000,
    },
  ]);

  return {
    workspace,
    projectId: project._id.toString(),
    projectName: project.name,
  };
}

/**
 * Resolve the Flow user + personal workspace for an Identity session.
 *
 * Hot path is read-only: find the user, reuse the personal workspace, return.
 * Writes only when the account is missing or profile fields actually changed.
 */
export async function ensureFlowAccount(
  sessionUser: BootstrapSessionUser,
): Promise<BootstrappedAccount> {
  if (!sessionUser.id) {
    throw new Error("Session is missing Identity subject (sub)");
  }

  return withDb(async () => {
    const email =
      sessionUser.email?.trim().toLowerCase() || `${sessionUser.id}@users.local`;
    const displayName =
      sessionUser.name?.trim() || email.split("@")[0] || "Noirly user";
    const avatarUrl = sessionUser.image ?? null;
    const emailVerified = Boolean(sessionUser.email);

    let user = await FlowUser.findOne({ identitySub: sessionUser.id });

    if (!user) {
      try {
        user = await FlowUser.create({
          identitySub: sessionUser.id,
          email,
          displayName,
          avatarUrl,
          emailVerified,
        });
      } catch (error) {
        // A concurrent first request created the account a moment earlier
        // (unique identitySub). Use it rather than failing with a 500.
        if (!isDuplicateKeyError(error)) throw error;
        user = await FlowUser.findOne({ identitySub: sessionUser.id });
        if (!user) throw error;
      }
    } else {
      const needsUpdate =
        user.email !== email ||
        user.displayName !== displayName ||
        (user.avatarUrl ?? null) !== avatarUrl ||
        user.emailVerified !== emailVerified;

      if (needsUpdate) {
        user.email = email;
        user.displayName = displayName;
        user.avatarUrl = avatarUrl;
        user.emailVerified = emailVerified;
        await user.save();
      }
    }

    const { workspace, projectId, projectName } =
      await ensurePersonalWorkspace(user);

    return {
      user: {
        id: user._id.toString(),
        identitySub: user.identitySub,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl ?? null,
      },
      personalWorkspace: {
        id: workspace._id.toString(),
        name: workspace.name,
        slug: workspace.slug,
        kind: "personal",
      },
      defaultProject:
        projectId && projectName ? { id: projectId, name: projectName } : null,
    };
  });
}
