export const FIELD_TYPES = ["text", "number", "select", "date", "person"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "Text", number: "Number", select: "Select", date: "Date", person: "Person",
};

export type FieldOption = { id: string; name: string };

/** A custom field on a project; each of its tasks can hold one value for it. */
export type ProjectField = {
  id: string;
  projectId: string;
  name: string;
  type: FieldType;
  /** Choices for a select field; empty otherwise. */
  options: FieldOption[];
  position: number;
};

/** text: string · number: number · select: option id · date: ISO (all-day, local noon) · person: user id. */
export type FieldValue = string | number;
export type FieldValues = Record<string, FieldValue>;

export const MAX_FIELDS = 30;
export const MAX_OPTIONS = 50;
export const MAX_TEXT = 500;

/**
 * The value to store for `raw` on `field`, or an error message. Null and
 * empty strings mean "clear". `memberIds` are the workspace's people.
 */
export function checkFieldValue(field: ProjectField, raw: unknown, memberIds: ReadonlySet<string>):
  { ok: true; value: FieldValue | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  const bad = (error: string) => ({ ok: false as const, error: `${field.name}: ${error}` });
  switch (field.type) {
    case "text":
      if (typeof raw !== "string") return bad("must be text");
      if (raw.length > MAX_TEXT) return bad(`at most ${MAX_TEXT} characters`);
      return raw.trim() ? { ok: true, value: raw.trim() } : { ok: true, value: null };
    case "number":
      if (typeof raw !== "number" || !Number.isFinite(raw)) return bad("must be a number");
      return { ok: true, value: raw };
    case "select":
      if (typeof raw !== "string" || !field.options.some((option) => option.id === raw)) return bad("not one of its options");
      return { ok: true, value: raw };
    case "date": {
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(raw) || Number.isNaN(Date.parse(raw))) return bad("must be a date");
      return { ok: true, value: new Date(raw).toISOString() };
    }
    case "person":
      if (typeof raw !== "string" || !memberIds.has(raw)) return bad("must be a workspace member");
      return { ok: true, value: raw };
  }
}

/** How a stored value reads in the UI; null when there's nothing to show. */
export function formatFieldValue(field: ProjectField, value: FieldValue | undefined, names: ReadonlyMap<string, string>): string | null {
  if (value === undefined || value === "") return null;
  switch (field.type) {
    case "text":
      return String(value);
    case "number":
      return typeof value === "number" ? new Intl.NumberFormat().format(value) : null;
    case "select":
      return field.options.find((option) => option.id === value)?.name ?? null;
    case "date":
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
    case "person":
      return names.get(String(value)) ?? "Former member";
  }
}
