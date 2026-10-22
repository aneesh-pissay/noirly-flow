/** Events a workspace webhook can subscribe to. */
export const WEBHOOK_EVENTS = ["task.created", "task.updated", "task.completed", "task.deleted", "comment.created"] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_LABEL: Record<WebhookEventType, string> = {
  "task.created": "Task created",
  "task.updated": "Task updated",
  "task.completed": "Task completed",
  "task.deleted": "Task deleted",
  "comment.created": "Comment added",
};

export const MAX_WEBHOOKS = 10;
/** After this many deliveries in a row fail for good, the webhook turns itself off. */
export const DISABLE_AFTER_FAILURES = 15;

export type WebhookView = {
  id: string;
  workspaceId: string;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  /** Why it turned itself off, if it did. */
  disabledReason: string | null;
  createdAt: string;
  lastDeliveryAt: string | null;
  lastStatus: "succeeded" | "failed" | null;
};

export type DeliveryView = {
  id: string;
  eventId: string;
  eventType: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  nextAttemptAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  lastResponse: string | null;
  lastDurationMs: number | null;
  createdAt: string;
};

/** The events a task update sends: always "updated", plus "completed" when it was just finished. */
export function taskUpdateEvents(beforeStatus: string | null, afterStatus: string): WebhookEventType[] {
  return afterStatus === "done" && beforeStatus !== "done" ? ["task.updated", "task.completed"] : ["task.updated"];
}
