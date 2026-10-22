"use client";

import { useId, useState } from "react";

export type Column = { key: string; label: string; value: number; detail: string };

/**
 * One series of counts as columns: <=24px wide, 4px rounded tops, square at the
 * baseline, 2px gaps, recessive gridlines. Only the peak is labelled; hover or
 * focus shows any column's value; "Show as table" lists them all.
 */
export function ColumnChart({ title, columns, unit }: { title: string; columns: Column[]; unit: string }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...columns.map((c) => c.value));
  // Clean tick values: 0, a half, the top.
  const top = max <= 4 ? max : Math.ceil(max / 2) * 2;
  const peak = columns.reduce((best, c, i) => (c.value > (columns[best]?.value ?? -1) ? i : best), 0);
  const plotHeight = 160;

  return (
    <figure className="rounded-[var(--r-lg)] border border-[var(--hairline)] bg-[var(--surface)] p-4" aria-labelledby={`${id}-title`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <figcaption id={`${id}-title`} className="text-sm font-medium text-[var(--foreground)]">{title}</figcaption>
        <button type="button" aria-expanded={table} onClick={() => setTable((v) => !v)} className="text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline">
          {table ? "Show as chart" : "Show as table"}
        </button>
      </div>
      {table ? (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-[var(--muted-foreground)]"><th className="py-1 font-normal">Period</th><th className="py-1 text-right font-normal">{unit}</th></tr></thead>
          <tbody>
            {columns.map((c) => (
              <tr key={c.key} className="border-t border-[var(--hairline)]"><td className="py-1 text-[var(--foreground)]">{c.detail}</td><td className="py-1 text-right tabular-nums text-[var(--foreground)]">{c.value}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        // mt-5: headroom above the tallest column for its value label.
        <div className="relative mt-5">
          {/* Gridlines at 0, half and top, hairline and recessive. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={{ height: plotHeight }}>
            {[top, top / 2, 0].map((tick) => (
              <div key={tick} className="absolute inset-x-0 flex items-center gap-2" style={{ top: plotHeight - (tick / top) * plotHeight }}>
                <span className="w-6 -translate-y-1/2 text-right text-[10px] tabular-nums text-[var(--muted-foreground)]">{Number.isInteger(tick) ? tick : ""}</span>
                <span className="h-px flex-1 -translate-y-1/2 bg-[var(--hairline)]" />
              </div>
            ))}
          </div>
          <div role="list" aria-label={title} className="relative ml-8 flex items-end gap-[2px]" style={{ height: plotHeight }}>
            {columns.map((c, i) => {
              const height = c.value ? Math.max(3, (c.value / top) * plotHeight) : 0;
              return (
                <div key={c.key} role="listitem" tabIndex={0} aria-label={`${c.detail}: ${c.value} ${unit}`}
                  onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none">
                  {/* The whole slot is the hover target; the column is capped at 24px. */}
                  <div className={`w-full max-w-6 rounded-t ${active === i ? "bg-[var(--foreground)]" : "bg-[var(--accent)]"} group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent)]`} style={{ height }} />
                  {i === peak && c.value ? (
                    <span aria-hidden className="absolute text-[10px] tabular-nums text-[var(--foreground)]" style={{ bottom: height + 2 }}>{c.value}</span>
                  ) : null}
                  {active === i ? (
                    <span role="tooltip" className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-[var(--hairline)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--foreground)] shadow" style={{ bottom: height + 18 }}>
                      {c.detail}: <strong className="tabular-nums">{c.value}</strong> {unit}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div aria-hidden className="ml-8 mt-1 flex gap-[2px]">
            {/* About six labels, on one line each, ending on the latest column. */}
            {columns.map((c, i) => (
              <span key={c.key} className="flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-[var(--muted-foreground)]">
                {(columns.length - 1 - i) % Math.ceil(columns.length / 6) === 0 ? c.label : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}
