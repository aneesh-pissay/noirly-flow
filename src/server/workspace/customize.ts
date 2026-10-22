import { Types } from "mongoose";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Workspace } from "@/src/server/models";
import { mapWorkspace } from "@/src/server/mappers";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import { checkStatusNames, isWorkspaceIcon, type OpenView } from "@/src/core/workspace-settings";
import { TASK_STATUSES, type TaskStatus } from "@/src/core/models/enums";

export type Customization = {
  icon?: string | null;
  color?: string | null;
  defaultView?: OpenView;
  statusNames?: Partial<Record<TaskStatus, string | null>>;
};

/** Icon, colour, default view and status names; admins only, personal workspaces included. */
export function customizeWorkspace(userId: string, workspaceId: string, patch: Customization) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, workspaceId, "admin");
    const workspace = await Workspace.findById(new Types.ObjectId(workspaceId));
    if (!workspace) throw new ApiError(404, "not_found", "Workspace not found");
    if (patch.icon !== undefined) {
      const icon = patch.icon?.trim() || null;
      if (icon && !isWorkspaceIcon(icon)) throw new ApiError(400, "invalid_request", "Pick a single emoji for the icon");
      workspace.icon = icon;
    }
    if (patch.color !== undefined) workspace.color = patch.color;
    if (patch.defaultView !== undefined) workspace.defaultView = patch.defaultView;
    if (patch.statusNames !== undefined) {
      const current = workspace.statusNames ?? {};
      const next = Object.fromEntries(TASK_STATUSES.map((status) => [
        status,
        patch.statusNames![status] !== undefined ? patch.statusNames![status]?.trim() || null : (current as Record<string, string | null>)[status] ?? null,
      ])) as Record<TaskStatus, string | null>;
      const problem = checkStatusNames(next);
      if (problem) throw new ApiError(400, "invalid_request", problem);
      workspace.set("statusNames", next);
    }
    await workspace.save();
    return mapWorkspace(workspace);
  });
}
