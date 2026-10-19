import { readApiJson } from "@/src/server/security/body";
import {
  ApiError,
  assertObjectId,
  getSyncProvider,
  jsonError,
  jsonOk,
} from "@/src/server/api/http";
import { createInviteBodySchema } from "@/src/server/api/schemas";
import { createInvite, listPendingInvites, revokeInvite } from "@/src/server/workspace/members";
import { sendInviteEmail } from "@/src/server/mail/invite-mail";
import { consumeRateLimit } from "@/src/server/security/rate-limit";
import { loadMe } from "@/src/server/users/me";

type Params = { params: Promise<{ workspaceId: string }> };

/** Pending (unused, unrevoked, unexpired) invites. Admins only. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const { ctx } = await getSyncProvider();
    return jsonOk({ invites: await listPendingInvites(ctx.userId, workspaceId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { workspaceId } = await params;
    await assertObjectId(workspaceId, "workspaceId");
    const body = createInviteBodySchema.safeParse(await readApiJson(request));
    if (!body.success) {
      throw new ApiError(400, "invalid_request", "Invalid invite payload");
    }
    const { ctx, sync } = await getSyncProvider();
    const email = body.data.email ?? null;
    if (email) {
      // Each one sends a real email from our domain; keep a compromised or
      // careless admin account from turning this into a spam relay.
      const limit = await consumeRateLimit(`flow-invite-mail:${ctx.userId}`, 30, 3600);
      if (!limit.allowed) {
        throw new ApiError(429, "rate_limited", "Too many invitations sent. Try again later.");
      }
    }
    const invite = await createInvite({
      workspaceId,
      userId: ctx.userId,
      role: body.data.role,
      email,
    });
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.AUTH_URL ??
      "http://localhost:3002";
    const url = `${origin.replace(/\/$/, "")}/invite/${invite.token}`;

    if (email) {
      const [workspace, me] = await Promise.all([sync.getWorkspace(workspaceId), loadMe(ctx)]);
      try {
        await sendInviteEmail({
          to: email,
          workspaceName: workspace.name,
          inviterName: me.user.displayName,
          role: invite.role,
          url,
          expiresAt: new Date(invite.expiresAt),
        });
      } catch {
        // Nobody received it, so don't leave a live link behind.
        await revokeInvite(invite.token);
        console.error("Invite email failed");
        throw new ApiError(502, "email_failed", "The invitation email couldn't be sent. Try again.");
      }
      // The link went to the invitee's inbox; the admin doesn't need it.
      return jsonOk({ invite: { role: invite.role, email, expiresAt: invite.expiresAt, emailed: true } }, 201);
    }

    return jsonOk({ invite: { ...invite, url } });
  } catch (error) {
    return jsonError(error);
  }
}
