"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import type { TokenScope } from "@/src/core/access-tokens";

const QUERY_KEY = ["access-tokens"] as const;
const fieldClass = "h-10 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-sm text-[var(--foreground)]";

const day = (iso: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));

/** Settings → API: make, list and revoke personal access tokens. */
export function AccessTokensSection() {
  const queryClient = useQueryClient();
  const tokens = useQuery({ queryKey: QUERY_KEY, queryFn: () => api.listAccessTokens() });
  const [name, setName] = useState("");
  const [scope, setScope] = useState<TokenScope>("read");
  const [days, setDays] = useState(90);
  // The secret only comes back when it's made, so it lives in memory until the page changes.
  const [secret, setSecret] = useState<{ id: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const create = useMutation({
    mutationFn: () => api.createAccessToken({ name: name.trim(), scope, days }),
    onSuccess: (result) => {
      setSecret({ id: result.accessToken.id, token: result.token });
      setCopied(false);
      setName("");
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
  const revoke = useMutation({
    mutationFn: (tokenId: string) => api.revokeAccessToken(tokenId),
    onSuccess: (_result, tokenId) => {
      if (secret?.id === tokenId) setSecret(null);
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) create.mutate();
  }

  const list = tokens.data?.tokens ?? [];
  const error = create.error ?? revoke.error;
  return (
    <section aria-labelledby="api-tokens-title" className="border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Developers</p>
      <h2 id="api-tokens-title" className="mt-1 text-sm font-medium text-[var(--foreground)]">API tokens</h2>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        Use Flow&apos;s API from scripts and other tools. A token acts as you, with your access to every workspace
        you&apos;re in. Read-only tokens can&apos;t change anything. Treat a token like a password.
      </p>

      {error ? <p role="alert" className="mt-3 text-sm text-[var(--accent)]">{error.message}</p> : null}

      {secret ? (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="new-api-token" className="text-xs text-[var(--muted-foreground)]">
            Your new token. It&apos;s shown once; copy it now.
          </label>
          <div className="flex gap-2">
            <input id="new-api-token" readOnly value={secret.token} onFocus={(event) => event.currentTarget.select()}
              className={`${fieldClass} min-w-0 flex-1 font-mono text-xs`} />
            <Button type="button" variant="secondary"
              onClick={() => void navigator.clipboard.writeText(secret.token).then(() => setCopied(true), () => setCopied(false))}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">Try it:</p>
          <pre className="overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--bg)] p-3 font-mono text-xs text-[var(--foreground)]">
            {`curl -H "Authorization: Bearer ${secret.token}"\\\n  ${origin}/api/workspaces`}
          </pre>
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-[var(--muted-foreground)]">
          Token name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder="e.g. Weekly report script" className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
          Access
          <select value={scope} onChange={(event) => setScope(event.target.value as TokenScope)} className={fieldClass}>
            <option value="read">Read only</option>
            <option value="write">Read and write</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
          Expires
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} className={fieldClass}>
            <option value={30}>In 30 days</option>
            <option value={90}>In 90 days</option>
            <option value={365}>In a year</option>
            <option value={0}>Never</option>
          </select>
        </label>
        <Button type="submit" disabled={!name.trim() || create.isPending}>{create.isPending ? "Making…" : "Create token"}</Button>
      </form>

      {tokens.isPending ? <p className="mt-4 text-sm text-[var(--muted-foreground)]">Loading tokens…</p> : list.length ? (
        <ul aria-label="API tokens" className="mt-4 divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          {list.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[var(--foreground)]">{token.name}</p>
                <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
                  {token.hint} · {token.scope === "read" ? "read only" : "read and write"}
                </p>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {token.lastUsedAt ? `Used ${day(token.lastUsedAt)}` : "Never used"} · {token.expiresAt ? `Expires ${day(token.expiresAt)}` : "No expiry"}
              </p>
              <Button type="button" variant="secondary" aria-label={`Revoke token ${token.name}`} disabled={revoke.isPending}
                onClick={() => { if (window.confirm(`Revoke “${token.name}”? Anything using it stops working.`)) revoke.mutate(token.id); }}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 text-sm text-[var(--muted-foreground)]">No tokens yet.</p>}
    </section>
  );
}
