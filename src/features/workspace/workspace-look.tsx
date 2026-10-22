"use client";

import { createContext, useContext, type ReactNode } from "react";
import { TASK_STATUSES, type TaskStatus } from "@/src/core/models/enums";
import { DEFAULT_STATUS_NAMES, workspaceInitial, type StatusNames } from "@/src/core/workspace-settings";
import type { Workspace } from "@/src/core/sync/types";

const StatusNamesContext = createContext<StatusNames>(DEFAULT_STATUS_NAMES);

/** The current workspace's status names, for everything under it. */
export function StatusNamesProvider({ names, children }: { names: StatusNames | undefined; children: ReactNode }) {
  return <StatusNamesContext.Provider value={names ?? DEFAULT_STATUS_NAMES}>{children}</StatusNamesContext.Provider>;
}

export function useStatusNames(): StatusNames {
  return useContext(StatusNamesContext);
}

/** The statuses as select options, in order, with the workspace's names. */
export function useStatusOptions(statuses: readonly TaskStatus[] = TASK_STATUSES) {
  const names = useStatusNames();
  return statuses.map((value) => ({ value, label: names[value] }));
}

/** The workspace's emoji, or its first letter, on its colour. */
export function WorkspaceIcon({ workspace, size = "sm" }: { workspace: Pick<Workspace, "name" | "icon" | "color">; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "size-10 text-xl rounded-xl" : "size-5 text-[11px] rounded-md";
  return (
    <span aria-hidden
      className={`inline-grid shrink-0 place-items-center font-semibold leading-none ${box} ${workspace.color ? "text-black/80" : "bg-[var(--surface-2)] text-[var(--muted-foreground)]"}`}
      style={workspace.color ? { backgroundColor: workspace.color } : undefined}>
      {workspace.icon ?? workspaceInitial(workspace.name)}
    </span>
  );
}
