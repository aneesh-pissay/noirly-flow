/** A task I finished, as the stats API returns it. */
export type CompletedRow = { completedAt: string; dueAt: string | null; dueHasTime: boolean };
/** An open task of mine with a due date. */
export type OpenRow = { dueAt: string; dueHasTime: boolean };
/** Time I tracked. */
export type TimeRow = { startedAt: string; minutes: number };

const dayValue = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

/** Local midnight `n` days before `date`'s day. */
export function daysAgo(date: Date, n: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - n);
}

/** Monday of `date`'s week. */
export function weekStart(date: Date) {
  return daysAgo(date, (date.getDay() + 6) % 7);
}

/** How many of `instants` fall on each of `days` (local days). */
export function countByDay(instants: string[], days: Date[]) {
  const index = new Map(days.map((day, i) => [dayValue(day), i]));
  const counts = days.map(() => 0);
  for (const iso of instants) {
    const i = index.get(dayValue(new Date(iso)));
    if (i !== undefined) counts[i]! += 1;
  }
  return counts;
}

/** How many fall in each Monday-to-Sunday week starting on `mondays`. */
export function countByWeek(instants: string[], mondays: Date[]) {
  const index = new Map(mondays.map((monday, i) => [dayValue(monday), i]));
  const counts = mondays.map(() => 0);
  for (const iso of instants) {
    const i = index.get(dayValue(weekStart(new Date(iso))));
    if (i !== undefined) counts[i]! += 1;
  }
  return counts;
}

/**
 * Of finished tasks that had a due date, how many were done by it: by the due
 * time if the task had one, else by the end of the due day. Null rate with none.
 */
export function onTimeRate(rows: CompletedRow[]) {
  const dated = rows.filter((row) => row.dueAt);
  const onTime = dated.filter((row) => row.dueHasTime
    ? Date.parse(row.completedAt) <= Date.parse(row.dueAt!)
    : dayValue(new Date(row.completedAt)) <= dayValue(new Date(row.dueAt!))).length;
  return { onTime, total: dated.length, rate: dated.length ? onTime / dated.length : null };
}

/** Open tasks already past due: their time if timed, else their day. */
export function overdueCount(rows: OpenRow[], now: Date) {
  return rows.filter((row) => row.dueHasTime ? Date.parse(row.dueAt) < now.getTime() : dayValue(new Date(row.dueAt)) < dayValue(now)).length;
}

/** Minutes tracked from `from` (inclusive) to `to` (exclusive). */
export function minutesBetween(rows: TimeRow[], from: Date, to: Date) {
  return rows.reduce((sum, row) => {
    const at = Date.parse(row.startedAt);
    return at >= from.getTime() && at < to.getTime() ? sum + row.minutes : sum;
  }, 0);
}
