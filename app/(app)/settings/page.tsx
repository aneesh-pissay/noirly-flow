import { SettingsView } from "@/src/features/settings/SettingsView";
import { requireFlowSession } from "@/src/server/api/http";
import { loadMe } from "@/src/server/users/me";

export default async function SettingsPage() {
  const ctx = await requireFlowSession();
  // Rendered with the profile, so the form arrives filled in rather than
  // waiting for the bundle to hydrate and then fetch /api/me.
  const me = await loadMe(ctx);

  const identityUrl = (
    process.env.NEXT_PUBLIC_IDENTITY_URL ??
    process.env.AUTH_NOIRLY_ISSUER ??
    ""
  ).replace(/\/$/, "");

  return (
    <SettingsView
      identityName={ctx.displayName}
      identityEmail={ctx.email}
      identityUrl={identityUrl}
      initialMe={me}
    />
  );
}
