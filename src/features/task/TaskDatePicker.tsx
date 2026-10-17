"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
const mondayIndex = (jsDay: number) => (jsDay + 6) % 7;

function parseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
}

function monthCursor(date: Date) {
  return { year: date.getFullYear(), month: date.getMonth() };
}

/**
 * A date plus an optional time. `value` is "YYYY-MM-DD" and `time` is
 * "HH:MM" or "" for all-day; `onChange` always receives both. `withTime`
 * off (start dates) hides the time field. `name` labels the controls.
 */
export function TaskDatePicker({ value, time = "", onChange, disabled = false, withTime = true, name = "due date" }: {
  value: string;
  time?: string;
  onChange: (value: string, time: string) => void;
  disabled?: boolean;
  withTime?: boolean;
  name?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const selected = parseDate(value);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => monthCursor(selected ?? new Date()));
  const cells = useMemo(() => {
    const count = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const first = mondayIndex(new Date(cursor.year, cursor.month, 1).getDay());
    return [...Array.from({ length: first }, () => null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [cursor]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); setOpen(false); }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function changeMonth(delta: number) {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return monthCursor(next);
    });
  }

  const label = selected
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(selected)
    : "Choose a date";

  return (
    <div ref={root} className="relative mt-1">
      <div className="flex items-center gap-2">
        <button type="button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
          onClick={() => {
            if (!open) setCursor(monthCursor(selected ?? new Date()));
            setOpen((current) => !current);
          }}
          className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-left text-sm text-[var(--foreground)] hover:border-[var(--accent)] disabled:opacity-50">
          <CalendarDays size={16} aria-hidden className="shrink-0 text-[var(--muted-foreground)]" />
          <span className={selected ? "" : "text-[var(--muted-foreground)]"}>{label}</span>
        </button>
        {value && withTime ? (
          <label className="relative flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] pl-3 pr-2 text-sm text-[var(--foreground)] focus-within:border-[var(--accent)] hover:border-[var(--accent)] has-[:disabled]:opacity-50">
            <Clock size={15} aria-hidden className="shrink-0 text-[var(--muted-foreground)]" />
            {/* Uncontrolled and committed on blur, so typing a time sends one save, not one per digit. */}
            <input key={time} type="time" aria-label="Due time (optional)" defaultValue={time} disabled={disabled}
              onBlur={(event) => { if (event.currentTarget.value !== time) onChange(value, event.currentTarget.value); }}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }}
              className="w-[6.5rem] bg-transparent text-sm outline-none [&::-webkit-calendar-picker-indicator]:hidden" />
          </label>
        ) : null}
        {value && !disabled ? <button type="button" aria-label={`Clear ${name}`} onClick={() => onChange("", "")}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--hairline)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"><X size={15} aria-hidden /></button> : null}
      </div>
      {open ? <div role="dialog" aria-label={`Choose ${name}`}
        className="absolute left-0 top-full z-50 mt-2 w-[min(19rem,calc(100vw-3rem))] rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--bg)]"><ChevronLeft size={17} /></button>
          <p className="text-sm font-medium">{new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(new Date(cursor.year, cursor.month, 1))}</p>
          <button type="button" aria-label="Next month" onClick={() => changeMonth(1)} className="grid size-9 place-items-center rounded-lg hover:bg-[var(--bg)]"><ChevronRight size={17} /></button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-[var(--muted-foreground)]">
          {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, index) => {
            if (day === null) return <span key={`blank-${index}`} />;
            const key = dateKey(cursor.year, cursor.month, day);
            const today = new Date();
            const isToday = key === dateKey(today.getFullYear(), today.getMonth(), today.getDate());
            const isSelected = key === value;
            return <button key={key} type="button" aria-pressed={isSelected}
              aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(new Date(cursor.year, cursor.month, day))}
              onClick={() => { onChange(key, time); setOpen(false); }}
              className={`grid aspect-square place-items-center rounded-lg text-sm hover:bg-[var(--accent-soft)] ${isSelected ? "bg-[var(--accent)] font-semibold text-[var(--accent-ink)]" : isToday ? "ring-1 ring-[var(--accent)]" : ""}`}>
              {day}
            </button>;
          })}
        </div>
        <div className="mt-2 flex justify-between border-t border-[var(--hairline)] pt-2">
          <button type="button" onClick={() => { onChange("", ""); setOpen(false); }} className="rounded-lg px-2 py-1.5 text-xs text-[var(--muted-foreground)] hover:bg-[var(--bg)]">Clear</button>
          <button type="button" onClick={() => { const now = new Date(); onChange(dateKey(now.getFullYear(), now.getMonth(), now.getDate()), time); setOpen(false); }} className="rounded-lg px-2 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--bg)]">Today</button>
        </div>
      </div> : null}
    </div>
  );
}
