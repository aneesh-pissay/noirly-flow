"use client";

import { useState } from "react";
import type { RecurrenceFrequency } from "@/src/core/models/enums";
import type { RecurrenceRule } from "@/src/core/sync/types";
import {
  WEEK,
  anchorDay,
  browserZone,
  describeRecurrence,
  presetLabel,
  presetOf,
  presetRule,
  type RepeatPreset,
} from "@/src/features/task/recurrence";

const PRESETS: RepeatPreset[] = ["daily", "weekdays", "weekly", "monthly", "yearly"];
const UNIT_OPTIONS: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: "daily", label: "days" },
  { value: "weekly", label: "weeks" },
  { value: "monthly", label: "months" },
  { value: "yearly", label: "years" },
];

/**
 * "Repeat": a few quick choices, plus Custom for every N days / weeks /
 * months / years, chosen weekdays, and counting from completion. `date` is
 * the task's due (or start) date as "YYYY-MM-DD"; quick choices anchor on it.
 */
export function TaskRepeatPicker({ value, date, onChange, disabled = false, selectClassName = "" }: {
  value: RecurrenceRule | null;
  date: string;
  onChange: (rule: RecurrenceRule | null) => void;
  disabled?: boolean;
  selectClassName?: string;
}) {
  const anchor = anchorDay(date);
  const preset = presetOf(value, anchor);
  const [customChosen, setCustomChosen] = useState(false);
  const custom = Boolean(value) && (customChosen || !preset);

  function edit(patch: Partial<RecurrenceRule>) {
    if (!value) return;
    const next: RecurrenceRule = { ...value, ...patch };
    if (next.frequency !== "weekly") delete next.byWeekday;
    if (next.frequency === "monthly" || next.frequency === "yearly") next.monthDay ??= anchor.getDate();
    else delete next.monthDay;
    const timeZone = browserZone();
    onChange(timeZone ? { ...next, timeZone } : next);
  }

  return (
    <div className="space-y-2">
      <select
        aria-label="Repeat"
        value={!value ? "none" : custom ? "custom" : preset ?? "custom"}
        disabled={disabled}
        onChange={(event) => {
          const choice = event.target.value;
          if (choice === "none") { setCustomChosen(false); onChange(null); return; }
          if (choice === "custom") {
            setCustomChosen(true);
            onChange(value ?? presetRule("weekly", anchor));
            return;
          }
          setCustomChosen(false);
          onChange(presetRule(choice as RepeatPreset, anchor));
        }}
        className={selectClassName}
      >
        <option value="none">Does not repeat</option>
        {PRESETS.map((p) => <option key={p} value={p}>{presetLabel(p, anchor)}</option>)}
        <option value="custom">Custom…</option>
      </select>

      {value && custom ? (
        <div className="space-y-2 rounded-xl border border-[var(--hairline)] p-3 text-sm text-[var(--foreground)]">
          <div className="flex items-center gap-2">
            <span className="text-[var(--muted-foreground)]">Every</span>
            {/* Committed on blur so typing "12" saves once, not twice. */}
            <input key={value.interval} type="number" min={1} max={365} inputMode="numeric" aria-label="Repeat every"
              defaultValue={value.interval} disabled={disabled}
              onBlur={(event) => {
                const interval = Math.min(365, Math.max(1, Math.round(Number(event.currentTarget.value) || 1)));
                if (interval !== value.interval) edit({ interval });
                else event.currentTarget.value = String(interval);
              }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
              className="h-9 w-16 rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 disabled:opacity-50" />
            <select aria-label="Repeat unit" value={value.frequency} disabled={disabled}
              onChange={(event) => {
                const frequency = event.target.value as RecurrenceFrequency;
                edit({ frequency, ...(frequency === "weekly" ? { byWeekday: [anchor.getDay()] } : {}) });
              }}
              className="h-9 rounded-lg border border-[var(--hairline)] bg-[var(--bg)] px-2 disabled:opacity-50">
              {UNIT_OPTIONS.map((unit) => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
            </select>
          </div>
          {value.frequency === "weekly" ? (
            <div role="group" aria-label="Repeat on" className="flex flex-wrap gap-1">
              {WEEK.map(({ day, label }) => {
                const on = value.byWeekday?.includes(day) ?? anchor.getDay() === day;
                return (
                  <button key={day} type="button" aria-pressed={on} disabled={disabled}
                    onClick={() => {
                      const current = value.byWeekday?.length ? value.byWeekday : [anchor.getDay()];
                      const next = on ? current.filter((d) => d !== day) : [...current, day];
                      // At least one day: turning off the last one keeps it.
                      if (next.length) edit({ byWeekday: next });
                    }}
                    className={`h-8 min-w-10 rounded-lg border px-2 text-xs ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)]" : "border-[var(--hairline)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"} disabled:opacity-50`}>
                    {label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-[var(--muted-foreground)]">
            <input type="checkbox" checked={Boolean(value.fromCompletion)} disabled={disabled}
              onChange={(event) => edit({ fromCompletion: event.target.checked || undefined })} />
            Count from when it&apos;s completed
          </label>
        </div>
      ) : null}

      {value ? <p className="text-xs text-[var(--muted-foreground)]">{describeRecurrence(value)}</p> : null}
    </div>
  );
}
