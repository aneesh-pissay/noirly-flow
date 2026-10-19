"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABEL, type DeliveryView, type WebhookEventType, type WebhookView } from "@/src/core/webhooks";

const fieldClass = "h-10 w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-sm text-[var(--foreground)]";
const smallButton = "rounded-[var(--r-sm)] border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50";
const keyFor = (workspaceId: string) => ["webhooks", workspaceId] as const;

const when = (iso: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** A secret, shown once, with copy. */
function SecretBox({ secret, label }: { secret: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[var(--muted-foreground)]" htmlFor="webhook-secret">{label}</label>
      <div className="flex gap-2">
        <input id="webhook-secret" readOnly value={secret} onFocus={(event) => event.currentTarget.select()} className={`${fieldClass} min-w-0 flex-1 font-mono text-xs`} />
        <Button type="button" variant="secondary" onClick={() => void navigator.clipboard.writeText(secret).then(() => setCopied(true), () => setCopied(false))}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Check the <code>Noirly-Signature</code> header with it: an HMAC-SHA256 of <code>&lt;t&gt;.&lt;raw body&gt;</code>.
      </p>
    </div>
  );
}

/** Workspace settings → Webhooks (admins). */
export function WebhooksSection({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const hooks = useQuery({ queryKey: keyFor(workspaceId), queryFn: () => api.listWebhooks(workspaceId) });
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEventType[]>(["task.created", "task.updated", "task.completed"]);
  const [secret, setSecret] = useState<{ webhookId: string; value: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api.createWebhook(workspaceId, { url: url.trim(), events }),
    onSuccess: (result) => {
      setSecret({ webhookId: result.webhook.id, value: result.secret });
      setUrl("");
      void queryClient.invalidateQueries({ queryKey: keyFor(workspaceId) });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (url.trim() && events.length) create.mutate();
  }

  const list = hooks.data?.webhooks ?? [];
  return (
    <section aria-labelledby="webhooks-title" className="border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Developers</p>
      <h2 id="webhooks-title" className="mt-1 text-sm font-medium text-[var(--foreground)]">Webhooks</h2>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Flow sends a signed POST to your URL when something happens in this workspace. Failed deliveries are retried for
        about 9 hours; a webhook that keeps failing turns itself off.
      </p>

      {hooks.isError ? <p role="alert" className="mt-3 text-sm">Could not load webhooks.</p> : null}
      {list.length ? (
        <ul aria-label="Webhooks" className="mt-4 flex flex-col gap-3">
          {list.map((hook) => (
            <WebhookRow key={hook.id} workspaceId={workspaceId} hook={hook}
              secret={secret?.webhookId === hook.id ? secret.value : null}
              onSecret={(value) => setSecret({ webhookId: hook.id, value })} />
          ))}
        </ul>
      ) : hooks.data ? <p className="mt-4 text-sm text-[var(--muted-foreground)]">No webhooks yet.</p> : null}

      <form onSubmit={submit} aria-label="New webhook" className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
          Endpoint URL
          <input value={url} onChange={(event) => setUrl(event.target.value)} type="url" maxLength={2000} placeholder="https://example.com/flow-hooks" className={fieldClass} />
        </label>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
          <legend className="mb-1 text-xs text-[var(--muted-foreground)]">Events</legend>
          {WEBHOOK_EVENTS.map((type) => (
            <label key={type} className="flex items-center gap-1.5 text-sm text-[var(--foreground)]">
              <input type="checkbox" checked={events.includes(type)}
                onChange={(event) => setEvents(event.target.checked ? [...events, type] : events.filter((e) => e !== type))} />
              {WEBHOOK_EVENT_LABEL[type]}
            </label>
          ))}
        </fieldset>
        {create.isError ? <p role="alert" className="text-sm text-[var(--accent)]">{create.error.message}</p> : null}
        <Button type="submit" disabled={!url.trim() || !events.length || create.isPending} className="self-start">
          {create.isPending ? "Adding…" : "Add webhook"}
        </Button>
      </form>
    </section>
  );
}

function WebhookRow({ workspaceId, hook, secret, onSecret }: {
  workspaceId: string;
  hook: WebhookView;
  secret: string | null;
  onSecret: (secret: string) => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const deliveriesKey = ["webhook-deliveries", hook.id] as const;
  const deliveries = useQuery({ queryKey: deliveriesKey, queryFn: () => api.listWebhookDeliveries(hook.id), enabled: open });
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keyFor(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: deliveriesKey });
  };
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  const status = !hook.enabled
    ? `Off${hook.disabledReason ? ` · ${hook.disabledReason}` : ""}`
    : hook.lastStatus
      ? `Last delivery ${hook.lastStatus}${hook.lastDeliveryAt ? ` ${when(hook.lastDeliveryAt)}` : ""}`
      : "No deliveries yet";

  return (
    <li data-webhook={hook.url} className="flex flex-col gap-2 border border-[var(--hairline)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--foreground)]">{hook.url}</span>
        <label className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
          <input type="checkbox" checked={hook.enabled} disabled={run.isPending} aria-label={`Webhook ${hook.url} on`}
            onChange={(event) => run.mutate(() => api.updateWebhook(hook.id, { enabled: event.target.checked }))} />
          On
        </label>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">{hook.events.map((type) => WEBHOOK_EVENT_LABEL[type]).join(" · ")}</p>
      <p className={`text-xs ${hook.enabled ? "text-[var(--muted-foreground)]" : "text-[var(--accent)]"}`}>{status}</p>
      {secret ? <SecretBox secret={secret} label="Signing secret. It's shown once; copy it now." /> : null}
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={smallButton} disabled={run.isPending} onClick={() => { setOpen(true); run.mutate(() => api.testWebhook(hook.id)); }}>
          Send test
        </button>
        <button type="button" className={smallButton} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? "Hide deliveries" : "Deliveries"}
        </button>
        <button type="button" className={smallButton} disabled={run.isPending}
          onClick={() => {
            if (!window.confirm("Make a new signing secret? The receiver must switch to it; the old one stops working now.")) return;
            run.mutate(async () => onSecret((await api.rotateWebhookSecret(hook.id)).secret));
          }}>
          New secret
        </button>
        <button type="button" className={smallButton} disabled={run.isPending} aria-label={`Delete webhook ${hook.url}`}
          onClick={() => { if (window.confirm("Delete this webhook and its delivery log?")) run.mutate(() => api.deleteWebhook(hook.id)); }}>
          Delete
        </button>
      </div>
      {open ? (
        deliveries.isPending ? <p className="text-xs text-[var(--muted-foreground)]">Loading deliveries…</p>
          : deliveries.data?.deliveries.length ? (
            <ul aria-label={`Deliveries to ${hook.url}`} className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
              {deliveries.data.deliveries.map((delivery) => (
                <DeliveryRow key={delivery.id} delivery={delivery} disabled={run.isPending}
                  onRedeliver={() => run.mutate(() => api.redeliverWebhook(hook.id, delivery.id))} />
              ))}
            </ul>
          ) : <p className="text-xs text-[var(--muted-foreground)]">Nothing sent yet.</p>
      ) : null}
    </li>
  );
}

function DeliveryRow({ delivery, disabled, onRedeliver }: { delivery: DeliveryView; disabled: boolean; onRedeliver: () => void }) {
  const outcome = delivery.status === "succeeded"
    ? `${delivery.lastStatusCode ?? ""} OK`
    : delivery.status === "pending"
      ? delivery.nextAttemptAt ? `Retrying ${when(delivery.nextAttemptAt)}` : "Sending"
      : delivery.lastError ?? "Failed";
  return (
    <li data-delivery={delivery.eventType} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
      <span className="font-mono text-[var(--foreground)]">{delivery.eventType}</span>
      <span className={delivery.status === "failed" ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"}>{outcome}</span>
      {delivery.status !== "succeeded" && delivery.lastStatusCode ? <span className="text-[var(--muted-foreground)]">HTTP {delivery.lastStatusCode}</span> : null}
      <span className="text-[var(--muted-foreground)]">
        {delivery.attempts} {delivery.attempts === 1 ? "try" : "tries"}{delivery.lastDurationMs !== null ? ` · ${delivery.lastDurationMs} ms` : ""} · {when(delivery.createdAt)}
      </span>
      <button type="button" className={`ml-auto ${smallButton}`} disabled={disabled} onClick={onRedeliver}>Redeliver</button>
    </li>
  );
}
