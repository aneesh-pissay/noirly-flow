"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@noirly-dev/ui";
import { FlowBusyScreen } from "@/src/components/FlowBusyScreen";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignOut() {
    setBusy(true);
    setError(null);
    try {
      await signOut({ callbackUrl: "/login", redirect: true });
    } catch {
      setBusy(false);
      setError("Could not sign out. Please try again.");
    }
  }

  return (
    <>
      {error ? <p role="alert" className="text-sm text-[var(--foreground)]">{error}</p> : null}
      {busy
        ? createPortal(<FlowBusyScreen label="Signing out" />, document.body)
        : null}
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start"
        onClick={() => void onSignOut()}
        disabled={busy}
      >
        <LogOut size={16} />
        Sign out
      </Button>
    </>
  );
}
