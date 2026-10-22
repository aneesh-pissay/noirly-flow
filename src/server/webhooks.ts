import { after } from "next/server";
import { Types } from "mongoose";
import {
  checkWebhookUrl, createEvent, deliver, generateSecret, isRetryable, nextAttemptAt, resolveWebhookUrl,
  type DeliveryResult, type WebhookEvent,
} from "@noirly-dev/webhooks";
import { ApiError } from "@/src/server/api/http";
import { withDb } from "@/src/server/db/mongodb";
import { Task, Webhook, WebhookDelivery, type WebhookDeliveryDocument, type WebhookDocument } from "@/src/server/models";
import { requireWorkspaceRole } from "@/src/server/workspace/members";
import {
  DISABLE_AFTER_FAILURES, MAX_WEBHOOKS, taskUpdateEvents,
  type DeliveryView, type WebhookEventType, type WebhookView,
} from "@/src/core/webhooks";
import type { SyncProvider } from "@/src/core/sync/types";

const oid = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
/** A claimed delivery is left alone this long, so two sweeps don't send it twice. */
const CLAIM_MS = 5 * 60_000;
const SWEEP_LIMIT = 50;

// Local http receivers, for development and the e2e suite only.
const urlOptions = () => ({ allowInsecureLocalhost: process.env.FLOW_WEBHOOKS_ALLOW_LOCALHOST === "1" });

function view(doc: WebhookDocument): WebhookView {
  return {
    id: String(doc._id),
    workspaceId: String(doc.workspaceId),
    url: doc.url,
    events: (doc.events ?? []) as WebhookEventType[],
    enabled: doc.enabled,
    disabledReason: doc.disabledReason ?? null,
    createdAt: doc.createdAt.toISOString(),
    lastDeliveryAt: doc.lastDeliveryAt ? doc.lastDeliveryAt.toISOString() : null,
    lastStatus: (doc.lastStatus ?? null) as WebhookView["lastStatus"],
  };
}

function deliveryView(doc: WebhookDeliveryDocument): DeliveryView {
  return {
    id: String(doc._id),
    eventId: doc.eventId,
    eventType: doc.eventType,
    status: doc.status as DeliveryView["status"],
    attempts: doc.attempts,
    nextAttemptAt: doc.status === "pending" && doc.nextAttemptAt ? doc.nextAttemptAt.toISOString() : null,
    lastStatusCode: doc.lastStatusCode ?? null,
    lastError: doc.lastError ?? null,
    lastResponse: doc.lastResponse ?? null,
    lastDurationMs: doc.lastDurationMs ?? null,
    createdAt: doc.createdAt.toISOString(),
  };
}

async function requireWebhook(userId: string, webhookId: string) {
  const hook = await Webhook.findById(oid(webhookId));
  if (!hook) throw new ApiError(404, "not_found", "Webhook not found");
  await requireWorkspaceRole(userId, String(hook.workspaceId), "admin");
  return hook;
}

async function assertUrl(url: string) {
  const shape = checkWebhookUrl(url, urlOptions());
  if (!shape.ok) throw new ApiError(400, "invalid_request", shape.error);
  const resolved = await resolveWebhookUrl(url, urlOptions());
  if (!resolved.ok) throw new ApiError(400, "invalid_request", resolved.error);
  return resolved.url.toString();
}

// ── Managing webhooks (admins) ────────────────────────────────────────────

export function listWebhooks(userId: string, workspaceId: string) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, workspaceId, "admin");
    const docs = await Webhook.find({ workspaceId: oid(workspaceId) }).sort({ createdAt: 1 }).lean();
    return docs.map((doc) => view(doc as WebhookDocument));
  });
}

/** Makes a webhook; the signing secret comes back this once. */
export function createWebhook(userId: string, workspaceId: string, input: { url: string; events: WebhookEventType[] }) {
  return withDb(async () => {
    await requireWorkspaceRole(userId, workspaceId, "admin");
    if (await Webhook.countDocuments({ workspaceId: oid(workspaceId) }) >= MAX_WEBHOOKS) {
      throw new ApiError(400, "limit_reached", `A workspace can have up to ${MAX_WEBHOOKS} webhooks.`);
    }
    const url = await assertUrl(input.url);
    const secret = generateSecret();
    const doc = await Webhook.create({
      workspaceId: oid(workspaceId), url, secret, events: [...new Set(input.events)], createdById: oid(userId),
    });
    return { webhook: view(doc.toObject()), secret };
  });
}

export function updateWebhook(userId: string, webhookId: string, patch: { url?: string; events?: WebhookEventType[]; enabled?: boolean }) {
  return withDb(async () => {
    const hook = await requireWebhook(userId, webhookId);
    if (patch.url !== undefined) hook.url = await assertUrl(patch.url);
    if (patch.events !== undefined) hook.events = [...new Set(patch.events)];
    if (patch.enabled !== undefined) {
      hook.enabled = patch.enabled;
      // Turning it back on starts the failure count over.
      if (patch.enabled) { hook.disabledReason = null; hook.failureStreak = 0; }
    }
    await hook.save();
    return view(hook.toObject());
  });
}

export function rotateWebhookSecret(userId: string, webhookId: string) {
  return withDb(async () => {
    const hook = await requireWebhook(userId, webhookId);
    hook.secret = generateSecret();
    await hook.save();
    return { secret: hook.secret };
  });
}

export function deleteWebhook(userId: string, webhookId: string) {
  return withDb(async () => {
    const hook = await requireWebhook(userId, webhookId);
    await WebhookDelivery.deleteMany({ webhookId: hook._id });
    await hook.deleteOne();
  });
}

export function listDeliveries(userId: string, webhookId: string) {
  return withDb(async () => {
    const hook = await requireWebhook(userId, webhookId);
    const docs = await WebhookDelivery.find({ webhookId: hook._id }).sort({ createdAt: -1 }).limit(25).lean();
    return docs.map((doc) => deliveryView(doc as WebhookDeliveryDocument));
  });
}

/** Sends a `ping` now and waits for the answer, so the admin sees it work. */
export function sendTestEvent(userId: string, webhookId: string) {
  return withDb(async () => {
    const hook = await requireWebhook(userId, webhookId);
    const event = createEvent("ping", { webhookId: String(hook._id), workspaceId: String(hook.workspaceId) });
    const delivery = await WebhookDelivery.create({
      webhookId: hook._id, workspaceId: hook.workspaceId, eventId: event.id, eventType: event.type, event, nextAttemptAt: new Date(),
    });
    await attempt(delivery._id, { force: true });
    const fresh = await WebhookDelivery.findById(delivery._id).lean();
    return deliveryView(fresh as WebhookDeliveryDocument);
  });
}

/** Queues a delivery to go again now, whatever happened before. */
export function redeliver(userId: string, webhookId: string, deliveryId: string) {
  return withDb(async () => {
    const hook = await requireWebhook(userId, webhookId);
    const delivery = await WebhookDelivery.findOneAndUpdate(
      { _id: oid(deliveryId), webhookId: hook._id },
      { $set: { status: "pending", nextAttemptAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!delivery) throw new ApiError(404, "not_found", "Delivery not found");
    await attempt(delivery._id, { force: true });
    const fresh = await WebhookDelivery.findById(delivery._id).lean();
    return deliveryView(fresh as WebhookDeliveryDocument);
  });
}

// ── Sending ───────────────────────────────────────────────────────────────

/**
 * One try at one delivery: claim it, send it, record what happened, and
 * schedule the next try or give up. `force` sends even if the webhook is off.
 */
async function attempt(deliveryId: Types.ObjectId, options: { force?: boolean } = {}) {
  const now = new Date();
  const claimed = await WebhookDelivery.findOneAndUpdate(
    { _id: deliveryId, status: "pending", nextAttemptAt: { $lte: now } },
    { $set: { nextAttemptAt: new Date(now.getTime() + CLAIM_MS) }, $inc: { attempts: 1 } },
    { returnDocument: "after" },
  );
  if (!claimed) return;
  const hook = await Webhook.findById(claimed.webhookId).lean();
  if (!hook || (!hook.enabled && !options.force)) {
    await WebhookDelivery.updateOne({ _id: claimed._id }, { $set: { status: "failed", lastError: hook ? "Webhook is off" : "Webhook was deleted", nextAttemptAt: null } });
    return;
  }
  const result: DeliveryResult = await deliver({
    url: hook.url, secret: hook.secret, event: claimed.event as WebhookEvent,
    userAgent: "Noirly-Flow-Webhooks/1", urlOptions: urlOptions(),
  });
  const retryAt = !result.ok && isRetryable(result) ? nextAttemptAt(claimed.attempts) : null;
  const status = result.ok ? "succeeded" : retryAt ? "pending" : "failed";
  await WebhookDelivery.updateOne({ _id: claimed._id }, {
    $set: {
      status, nextAttemptAt: retryAt,
      lastStatusCode: result.status, lastError: result.error, lastResponse: result.responseSnippet, lastDurationMs: result.durationMs,
    },
  });
  if (status === "pending") return;
  if (result.ok) {
    await Webhook.updateOne({ _id: hook._id }, { $set: { failureStreak: 0, lastDeliveryAt: new Date(), lastStatus: "succeeded" } });
    return;
  }
  // Gave up on this one. A 410 or a long run of failures turns the webhook off.
  const updated = await Webhook.findOneAndUpdate(
    { _id: hook._id },
    { $inc: { failureStreak: 1 }, $set: { lastDeliveryAt: new Date(), lastStatus: "failed" } },
    { returnDocument: "after" },
  );
  if (updated && updated.enabled && (result.status === 410 || updated.failureStreak >= DISABLE_AFTER_FAILURES)) {
    await Webhook.updateOne({ _id: hook._id }, {
      $set: { enabled: false, disabledReason: result.status === 410 ? "The receiver answered 410 Gone" : `${updated.failureStreak} deliveries in a row failed` },
    });
  }
}

/** Sends every delivery that's due, oldest first. */
export function sweepWebhookDeliveries(limit = SWEEP_LIMIT) {
  return withDb(async () => {
    const due = await WebhookDelivery.find({ status: "pending", nextAttemptAt: { $lte: new Date() } })
      .sort({ nextAttemptAt: 1 }).limit(limit).select("_id").lean();
    for (const row of due) await attempt(row._id);
    return { attempted: due.length };
  });
}

let lastSweep = 0;
/** Retries due deliveries after the response, at most every 30 seconds per instance. */
export function scheduleWebhookSweep() {
  const now = Date.now();
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  after(async () => {
    try { await sweepWebhookDeliveries(); }
    catch { console.error("Webhook sweep failed; due deliveries go out on the next one."); }
  });
}

/** Queues an event for every enabled webhook in the workspace that wants it, then sends right after the response. */
export async function emitWebhookEvent(workspaceId: string, type: WebhookEventType, data: unknown) {
  try {
    const hooks = await withDb(() => Webhook.find({ workspaceId: oid(workspaceId), enabled: true, events: type }).select("_id").lean());
    if (!hooks.length) return;
    const event = createEvent(type, data);
    const rows = await withDb(() => WebhookDelivery.insertMany(hooks.map((hook) => ({
      webhookId: hook._id, workspaceId: oid(workspaceId), eventId: event.id, eventType: type, event, nextAttemptAt: new Date(),
    }))));
    after(async () => {
      try { await withDb(async () => { for (const row of rows) await attempt(row._id); }); }
      catch { console.error("Webhook delivery failed; it will be retried."); }
    });
  } catch {
    // Webhooks never fail the change that caused them.
    console.error("Queueing webhook event failed");
  }
}

/** Does this workspace have any webhook listening? Lets updates skip the extra read when not. */
async function listening(workspaceId: string | Types.ObjectId) {
  return Boolean(await withDb(() => Webhook.exists({ workspaceId: oid(workspaceId), enabled: true })));
}

/** The provider, sending webhook events after task and comment changes. */
export function withWebhooks(sync: SyncProvider): SyncProvider {
  return {
    ...sync,
    async createTask(input) {
      const task = await sync.createTask(input);
      await emitWebhookEvent(task.workspaceId, "task.created", task);
      return task;
    },
    async updateTask(taskId, patch) {
      const before = await withDb(() => Task.findById(oid(taskId)).select("workspaceId status").lean());
      const hooked = before ? await listening(before.workspaceId) : false;
      const task = await sync.updateTask(taskId, patch);
      if (hooked) {
        for (const type of taskUpdateEvents(before?.status ?? null, task.status)) await emitWebhookEvent(task.workspaceId, type, task);
      }
      return task;
    },
    async deleteTask(taskId) {
      const task = await sync.deleteTask(taskId);
      await emitWebhookEvent(task.workspaceId, "task.deleted", task);
      return task;
    },
    async createComment(input) {
      const comment = await sync.createComment(input);
      const task = await withDb(() => Task.findById(oid(input.taskId)).select("workspaceId projectId").lean());
      if (task) await emitWebhookEvent(String(task.workspaceId), "comment.created", { ...comment, projectId: task.projectId ? String(task.projectId) : null });
      return comment;
    },
  };
}
