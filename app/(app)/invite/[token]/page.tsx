import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ApiError, getSyncProvider } from "@/src/server/api/http";
import { acceptInvite } from "@/src/server/workspace/members";

type Params = { params: Promise<{ token: string }> };

function isNextRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

export default async function InvitePage({ params }: Params) {
  const session = await auth();
  const { token } = await params;
  if (!session?.user?.id) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  try {
    const { ctx } = await getSyncProvider();
    const result = await acceptInvite(ctx.userId, token, ctx.email);
    // Picked up by <JoinedNotice> to confirm the join once they land.
    redirect(`/w/${result.workspaceId}?joined=${result.alreadyMember ? "already" : "1"}`);
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    const message =
      error instanceof ApiError ? error.message : "This invite could not be used.";
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-3 px-6 py-16">
        <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--muted-foreground)]">
          Invite
        </p>
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-tight">
          Invite failed
        </h1>
        <p className="text-sm text-[var(--foreground)]">{message}</p>
      </main>
    );
  }
}
