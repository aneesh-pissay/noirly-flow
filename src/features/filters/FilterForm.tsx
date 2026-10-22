"use client";

import { useState } from "react";
import { compileFilter, type FilterContext } from "@/src/core/filter-query";

const fieldClass = "mt-1 w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

/** The terms, for the help line under the query field. */
export const FILTER_HELP = "today · tomorrow · overdue · no date · next 7 days · p1–p4 · #Project · #Inbox · @tag · assigned to: me · no assignee · recurring · blocked · deadline · search: text — join with & | ! ( )";

/** Name and query, with the query checked as you type. Saving is refused while it doesn't parse. */
export function FilterForm({ context, initial, submitLabel, pending, error, onSubmit, onCancel }: {
  context: FilterContext | null;
  initial?: { name: string; query: string };
  submitLabel: string;
  pending: boolean;
  error?: string | null;
  onSubmit: (value: { name: string; query: string }) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [query, setQuery] = useState(initial?.query ?? "");
  const compiled = context && query.trim() ? compileFilter(query, context) : null;
  const problem = compiled && !compiled.ok ? compiled.error : null;
  const ready = Boolean(name.trim() && query.trim() && compiled?.ok && !pending);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onSubmit({ name: name.trim(), query: query.trim() });
      }}
    >
      <label className="block text-sm">Name
        <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Due this week at work" className={fieldClass} />
      </label>
      <label className="block text-sm">Query
        <input value={query} maxLength={500} onChange={(event) => setQuery(event.target.value)} placeholder="next 7 days & #Work"
          aria-invalid={Boolean(problem)} aria-describedby="filter-query-help" className={`${fieldClass} font-mono`} />
      </label>
      <p id="filter-query-help" className={`text-xs ${problem ? "text-[var(--accent)]" : "text-[var(--muted-foreground)]"}`} role={problem ? "alert" : undefined}>
        {problem ?? FILTER_HELP}
      </p>
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      <div className="flex gap-2">
        <button type="submit" disabled={!ready} className="min-h-10 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-ink)] disabled:opacity-50">
          {pending ? "Saving…" : submitLabel}
        </button>
        {onCancel ? <button type="button" onClick={onCancel} className="min-h-10 px-3 text-sm">Cancel</button> : null}
      </div>
    </form>
  );
}
