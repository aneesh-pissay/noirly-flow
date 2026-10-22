"use client";

import { createPortal, useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { Button } from "@noirly-dev/ui";
import { signOutAction } from "@/src/features/auth/actions";
import { FlowBusyScreen } from "@/src/components/FlowBusyScreen";
import { clearOfflineData } from "@/src/lib/offline";

/**
 * A server action, so sign-out is one request: the action clears the session
 * and its redirect carries /login back in the same response. The client
 * signOut() it replaced fetched a CSRF token, POSTed, then loaded /login.
 */
export function SignOutButton() {
  return (
    // Saved offline copies are this person's; they go with the session.
    <form action={signOutAction} onSubmit={() => void clearOfflineData()} className="w-full">
      <SignOutSubmit />
    </form>
  );
}

function SignOutSubmit() {
  const { pending } = useFormStatus();
  return (
    <>
      {pending
        ? createPortal(<FlowBusyScreen label="Signing out" />, document.body)
        : null}
      <Button
        type="submit"
        variant="ghost"
        className="w-full justify-start"
        disabled={pending}
      >
        <LogOut size={16} />
        Sign out
      </Button>
    </>
  );
}
