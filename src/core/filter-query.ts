import type { Task } from "@/src/core/sync/types";

/**
 * The saved-filter query language, Todoist style:
 *
 *   today & #Work & p1
 *   (overdue | today) & assigned to: me
 *   next 7 days & !#Inbox & !recurring
 *
 * Terms: today, tomorrow, overdue, no date, next N days (or "N days"),
 * p1–p4 (p4 = no priority), #project or #inbox, @tag, assigned to: me | others |
 * <name>, no assignee, recurring, blocked, deadline / no deadline, search: <text>.
 * Combine with & (and), | (or), ! (not) and parentheses; & binds tighter
 * than |. Evaluated in the browser, so days are the viewer's days.
 */

export type FilterContext = {
  now?: Date;
  meId: string;
  projects: Array<{ id: string; name: string }>;
  members: Array<{ userId: string; displayName: string }>;
  tags?: Array<{ id: string; name: string }>;
};

export type FilterResult =
  | { ok: true; test: (task: Task) => boolean }
  | { ok: false; error: string };

type Predicate = (task: Task, ctx: Required<FilterContext>) => boolean;

const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;

/** Whole local days from today to the task's due day (negative = past), or null. */
function dayOffset(task: Task, now: Date): number | null {
  if (!task.dueAt) return null;
  return Math.round((startOf(new Date(task.dueAt)) - startOf(now)) / DAY);
}

function isOverdue(task: Task, now: Date): boolean {
  if (!task.dueAt) return false;
  if (task.dueHasTime) return Date.parse(task.dueAt) < now.getTime();
  return (dayOffset(task, now) ?? 0) < 0;
}

const PRIORITIES = { "1": "high", "2": "medium", "3": "low", "4": "none" } as const;

/** One term's text into a predicate, or an error message. */
function term(raw: string, ctx: Required<FilterContext>): Predicate | string {
  const text = raw.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  if (!text) return "Expected a term";

  if (lower === "today") return (t, c) => dayOffset(t, c.now) === 0;
  if (lower === "tomorrow") return (t, c) => dayOffset(t, c.now) === 1;
  if (lower === "overdue") return (t, c) => isOverdue(t, c.now);
  if (lower === "no date" || lower === "no due date") return (t) => !t.dueAt;
  const days = /^(?:next )?(\d{1,3}) days?$/.exec(lower);
  if (days) {
    const n = Number(days[1]);
    return (t, c) => { const d = dayOffset(t, c.now); return d !== null && d >= 0 && d < n; };
  }

  const priority = /^p([1-4])$/.exec(lower);
  if (priority) {
    const wanted = PRIORITIES[priority[1] as keyof typeof PRIORITIES];
    // "urgent" is no longer offered but older tasks keep it; it counts as p1.
    return (t) => t.priority === wanted || (wanted === "high" && t.priority === "urgent");
  }
  if (lower === "no priority") return (t) => t.priority === "none";

  if (text.startsWith("#")) {
    const name = text.slice(1).trim().toLowerCase();
    if (name === "inbox") return (t) => t.projectId === null;
    const project = ctx.projects.find((p) => p.name.trim().toLowerCase() === name);
    if (!project) return `No project called “${text.slice(1).trim()}”`;
    return (t) => t.projectId === project.id;
  }
  if (text.startsWith("@")) {
    const name = text.slice(1).trim().toLowerCase();
    const tag = ctx.tags.find((t) => t.name.trim().toLowerCase() === name);
    if (!tag) return `No tag called “${text.slice(1).trim()}”`;
    return (t) => t.tagIds.includes(tag.id);
  }

  const assigned = /^assigned to:? ?(.+)$/i.exec(text);
  if (assigned) {
    const who = assigned[1]!.trim().toLowerCase();
    if (who === "me") return (t, c) => t.assigneeIds.includes(c.meId);
    if (who === "others") return (t, c) => t.assigneeIds.some((id) => id !== c.meId);
    const member = ctx.members.find((m) => m.displayName.trim().toLowerCase() === who);
    if (!member) return `No member called “${assigned[1]!.trim()}”`;
    return (t) => t.assigneeIds.includes(member.userId);
  }
  if (lower === "no assignee" || lower === "unassigned") return (t) => t.assigneeIds.length === 0;
  if (lower === "recurring") return (t) => Boolean(t.recurrence);
  if (lower === "blocked") return (t) => Boolean(t.blocked);
  if (lower === "deadline") return (t) => Boolean(t.deadlineAt);
  if (lower === "no deadline") return (t) => !t.deadlineAt;

  const search = /^search: ?(.+)$/i.exec(text);
  if (search) {
    const needle = search[1]!.trim().toLowerCase();
    return (t) => t.title.toLowerCase().includes(needle);
  }
  return `Unknown term “${text}”`;
}

type Token = { kind: "and" | "or" | "not" | "open" | "close" } | { kind: "term"; text: string };

function tokenize(query: string): Token[] {
  const tokens: Token[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer.trim()) tokens.push({ kind: "term", text: buffer.trim() });
    buffer = "";
  };
  for (const char of query) {
    const kind = char === "&" ? "and" : char === "|" ? "or" : char === "(" ? "open" : char === ")" ? "close" : null;
    // "!" only negates at the start of a term, so "Fix it!" in search: stays literal.
    if (char === "!" && !buffer.trim()) { tokens.push({ kind: "not" }); continue; }
    if (kind) { flush(); tokens.push({ kind }); } else buffer += char;
  }
  flush();
  return tokens;
}

/** Parses a query into a task predicate, or the first problem with it. */
export function compileFilter(query: string, context: FilterContext): FilterResult {
  const ctx: Required<FilterContext> = { now: new Date(), tags: [], ...context };
  const tokens = tokenize(query);
  if (!tokens.length) return { ok: false, error: "Type a query, e.g. today & p1" };
  let i = 0;

  function or(): Predicate | string {
    let left = and();
    while (typeof left !== "string" && tokens[i]?.kind === "or") {
      i += 1;
      const right = and();
      if (typeof right === "string") return right;
      const l = left;
      left = (t, c) => l(t, c) || right(t, c);
    }
    return left;
  }
  function and(): Predicate | string {
    let left = unary();
    while (typeof left !== "string" && tokens[i]?.kind === "and") {
      i += 1;
      const right = unary();
      if (typeof right === "string") return right;
      const l = left;
      left = (t, c) => l(t, c) && right(t, c);
    }
    return left;
  }
  function unary(): Predicate | string {
    const token = tokens[i];
    if (!token) return "The query ends too early";
    if (token.kind === "not") {
      i += 1;
      const inner = unary();
      return typeof inner === "string" ? inner : (t, c) => !inner(t, c);
    }
    if (token.kind === "open") {
      i += 1;
      const inner = or();
      if (typeof inner === "string") return inner;
      if (tokens[i]?.kind !== "close") return "Missing )";
      i += 1;
      return inner;
    }
    if (token.kind === "term") {
      i += 1;
      return term(token.text, ctx);
    }
    return `Unexpected “${{ and: "&", or: "|", close: ")" }[token.kind]}”`;
  }

  const predicate = or();
  if (typeof predicate === "string") return { ok: false, error: predicate };
  if (i < tokens.length) return { ok: false, error: tokens[i]!.kind === "close" ? "Unexpected “)”" : "Join terms with & or |" };
  return { ok: true, test: (task) => predicate(task, ctx) };
}
