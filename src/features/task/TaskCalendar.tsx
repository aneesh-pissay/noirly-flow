"use client";

import { useMemo, useState } from "react";
import { Button } from "@noirly-dev/ui";
import type { Task } from "@/src/core/sync/types";
import { dueTone, isoToDateInput } from "@/src/features/task/dates";
import { priorityDotClassName } from "@/src/features/task/priority";

type Props = {
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
};

/** Tasks shown in a day before it collapses behind "+N more". */
const DAY_LIMIT = 4;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1));
}

function dateKey(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** Monday-first index 0..6 for a JS Date.getDay() value. */
function mondayIndex(jsDay: number) {
  return (jsDay + 6) % 7;
}

export function TaskCalendar({ tasks, onOpenTask }: Props) {
  const now = new Date();
  const [cursor, setCursor] = useState({
    year: now.getFullYear(),
    month: now.getMonth(),
  });

  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      if (task.status === "canceled") continue;
      const key = isoToDateInput(task.dueAt);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [tasks]);

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const startPad = mondayIndex(new Date(cursor.year, cursor.month, 1).getDay());
  const cells: Array<{ key: string; day: number | null }> = [];
  for (let i = 0; i < startPad; i += 1) {
    cells.push({ key: `pad-${i}`, day: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      key: dateKey(cursor.year, cursor.month, day),
      day,
    });
  }

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const undated = tasks.filter(
    (task) => !task.dueAt && task.status !== "canceled",
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setCursor((current) => {
              const date = new Date(current.year, current.month - 1, 1);
              return { year: date.getFullYear(), month: date.getMonth() };
            })
          }
        >
          Prev
        </Button>
        <p className="text-sm font-medium text-[var(--foreground)]">
          {monthLabel(cursor.year, cursor.month)}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            setCursor((current) => {
              const date = new Date(current.year, current.month + 1, 1);
              return { year: date.getFullYear(), month: date.getMonth() };
            })
          }
        >
          Next
        </Button>
      </div>

      <div className="overflow-x-auto border border-[var(--hairline)] bg-[var(--surface)]">
        <div className="grid min-w-[42rem] grid-cols-7 border-b border-[var(--hairline)]">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="px-2 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid min-w-[42rem] grid-cols-7">
          {cells.map((cell) => {
            if (cell.day === null) {
              return (
                <div
                  key={cell.key}
                  className="min-h-28 border-b border-r border-[var(--hairline)] bg-[var(--bg)]/40"
                />
              );
            }
            const key = dateKey(cursor.year, cursor.month, cell.day);
            const dayTasks = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const expanded = expandedDay === key;
            const shown = expanded ? dayTasks : dayTasks.slice(0, DAY_LIMIT);
            return (
              <div
                key={cell.key}
                aria-current={isToday ? "date" : undefined}
                className={`min-h-28 border-b border-r border-[var(--hairline)] p-2 ${
                  isToday ? "bg-[var(--accent-soft)] shadow-[inset_0_0_0_1px_var(--accent)]" : ""
                }`}
              >
                <p
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 font-mono text-[11px] ${
                    isToday
                      ? "bg-[var(--accent)] font-bold text-[var(--accent-foreground)]"
                      : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {cell.day}
                </p>
                <ul className="mt-1 flex flex-col gap-1">
                  {shown.map((task) => {
                    const done = task.status === "done";
                    const overdue = !done && dueTone(task.dueAt) === "overdue";
                    return (
                      <li key={task.id}>
                        <button
                          type="button"
                          title={task.title}
                          onClick={() => onOpenTask(task.id)}
                          className={`flex w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left text-[11px] transition-colors hover:border-[var(--accent)] ${
                            done
                              ? "border-transparent text-[var(--muted-foreground)] line-through"
                              : overdue
                                ? "border-red-500/40 bg-red-500/10 text-[var(--foreground)]"
                                : "border-[var(--hairline)] bg-[var(--surface-2)] text-[var(--foreground)]"
                          }`}
                        >
                          <span
                            aria-hidden
                            className={`size-1.5 shrink-0 rounded-full ${priorityDotClassName(task.priority)}`}
                          />
                          <span className="truncate">
                            {task.title}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {dayTasks.length > DAY_LIMIT ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => setExpandedDay(expanded ? null : key)}
                        className="px-1 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--accent)]"
                      >
                        {expanded ? "Show less" : `+${dayTasks.length - DAY_LIMIT} more`}
                      </button>
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 ? (
        <div className="border border-[var(--hairline)] bg-[var(--surface)] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            No due date
          </p>
          <ul className="mt-2 flex flex-col gap-1">
            {undated.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => onOpenTask(task.id)}
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
