import type { ActivityEvent } from "@/src/core/sync/types";
import {
  memberName,
  type WorkspaceMember,
} from "@/src/features/workspace/members";

export function formatChange(value: unknown): string {
  if (value == null) return "none";
  if (typeof value === "string") return value.replaceAll("_", " ");
  return String(value);
}

export function describeActivity(
  event: ActivityEvent,
  members: WorkspaceMember[],
): string {
  const actor = memberName(members, event.actorId);
  const meta = event.metadata ?? {};

  switch (event.verb) {
    case "task.created": {
      const title =
        typeof meta.title === "string" ? ` “${meta.title}”` : "";
      return `${actor} created a task${title}`;
    }
    case "task.deleted": {
      const title =
        typeof meta.title === "string" ? ` “${meta.title}”` : "";
      return `${actor} deleted a task${title}`;
    }
    case "project.renamed":
      return typeof meta.from === "string" && typeof meta.to === "string"
        ? `${actor} renamed project “${meta.from}” to “${meta.to}”`
        : `${actor} renamed a project`;
    case "project.deleted": {
      const name = typeof meta.name === "string" ? ` “${meta.name}”` : "";
      return `${actor} deleted project${name}`;
    }
    case "attachment.added": {
      const name = typeof meta.filename === "string" ? ` “${meta.filename}”` : "";
      return `${actor} attached${name}`;
    }
    case "comment.created":
      return `${actor} commented`;
    case "task.assigned": {
      const to = Array.isArray(meta.to)
        ? meta.to.map((id) => memberName(members, String(id)))
        : [];
      return to.length
        ? `${actor} assigned ${to.join(", ")}`
        : `${actor} cleared assignees`;
    }
    case "task.updated": {
      const parts: string[] = [];
      for (const [field, change] of Object.entries(meta)) {
        if (
          change &&
          typeof change === "object" &&
          "from" in change &&
          "to" in change
        ) {
          const typed = change as { from: unknown; to: unknown };
          parts.push(
            `${field} ${formatChange(typed.from)} → ${formatChange(typed.to)}`,
          );
        }
      }
      return parts.length
        ? `${actor} updated ${parts.join(", ")}`
        : `${actor} updated a task`;
    }
    default:
      return `${actor} ${event.verb}`;
  }
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function activityToCsv(
  events: ActivityEvent[],
  members: WorkspaceMember[],
): string {
  const header = ["createdAt", "verb", "actor", "taskId", "summary"];
  const rows = events.map((event) => [
    event.createdAt,
    event.verb,
    memberName(members, event.actorId),
    event.taskId ?? "",
    describeActivity(event, members),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => csvEscape(String(cell))).join(","))
    .join("\n");
}
