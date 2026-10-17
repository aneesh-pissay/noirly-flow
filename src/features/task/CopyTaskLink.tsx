"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

/** Copies the task's lasting link (/w/:id/t/:taskId), which keeps working after it moves. */
export function CopyTaskLink({ workspaceId, taskId }: { workspaceId: string; taskId: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(`${window.location.origin}/w/${workspaceId}/t/${taskId}`);
          setState("copied");
        } catch {
          setState("failed");
        }
        window.setTimeout(() => setState("idle"), 2000);
      }}
      className="ml-auto mr-4 inline-flex cursor-pointer items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
    >
      <Link2 size={13} aria-hidden />
      <span role="status">{state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy link"}</span>
    </button>
  );
}
