"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@noirly-dev/ui";
import { SlidersHorizontal } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import {
  FIELD_TYPES, FIELD_TYPE_LABEL, formatFieldValue,
  type FieldType, type FieldValue, type FieldValues, type ProjectField,
} from "@/src/core/custom-fields";
import { dateInputToIso, isoToDateInput } from "@/src/features/task/dates";
import type { WorkspaceMember } from "@/src/features/workspace/members";

const inputClass = "h-9 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)] disabled:opacity-50";
const smallButton = "rounded-[var(--r-sm)] border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50";

export function useFields(projectId: string | null) {
  return useQuery({
    queryKey: projectId ? qk.fields(projectId) : ["fields", "none"],
    queryFn: () => api.listFields(projectId!),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });
}

/** "Fields" in a project's header: opens the field manager. */
export function ProjectFieldsButton({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]">
        <SlidersHorizontal size={14} aria-hidden />
        Fields
      </button>
      <Dialog open={open} title="Custom fields" onClose={() => setOpen(false)}>
        <FieldManager projectId={projectId} canWrite={canWrite} />
      </Dialog>
    </>
  );
}

function FieldManager({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const fields = useFields(projectId);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.fields(projectId) });
    // Deleting a field or option clears task values.
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => setError(null),
    onSuccess: refresh,
    onError: (err: Error) => setError(err.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const choices = type === "select" ? options.split(",").map((o) => o.trim()).filter(Boolean).map((o) => ({ name: o })) : undefined;
    run.mutate(() => api.createField(projectId, { name: trimmed, type, options: choices }), {
      onSuccess: () => { setName(""); setOptions(""); },
    });
  }

  const list = fields.data?.fields ?? [];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--muted-foreground)]">Extra details every task in this project can carry. Set them in the task drawer.</p>
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      {fields.isPending ? <p className="text-sm text-[var(--muted-foreground)]">Loading fields…</p> : null}
      {list.length ? (
        <ul aria-label="Fields" className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          {list.map((field) => (
            <li key={field.id} data-field={field.name} className="flex flex-col gap-2 py-3">
              <div className="flex items-center gap-2">
                {canWrite ? (
                  <input key={field.name} defaultValue={field.name} aria-label={`Name of ${field.name}`} maxLength={40} className={inputClass}
                    onBlur={(event) => {
                      const next = event.target.value.trim();
                      if (next && next !== field.name) run.mutate(() => api.updateField(field.id, { name: next }));
                    }} />
                ) : <span className="flex-1 text-sm text-[var(--foreground)]">{field.name}</span>}
                <span className="w-14 shrink-0 text-right font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">{FIELD_TYPE_LABEL[field.type]}</span>
                {canWrite ? (
                  <button type="button" className={smallButton} disabled={run.isPending} aria-label={`Delete field ${field.name}`}
                    onClick={() => { if (window.confirm(`Delete “${field.name}” and its value on every task?`)) run.mutate(() => api.deleteField(field.id)); }}>
                    Delete
                  </button>
                ) : null}
              </div>
              {field.type === "select" ? (
                <OptionEditor field={field} canWrite={canWrite} disabled={run.isPending}
                  onSave={(next) => run.mutate(() => api.updateField(field.id, { options: next }))} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : fields.data ? <p className="text-sm text-[var(--muted-foreground)]">No fields yet.</p> : null}
      {canWrite ? (
        <form onSubmit={submit} className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            New field
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="e.g. Client" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Type
            <select aria-label="Field type" value={type} onChange={(event) => setType(event.target.value as FieldType)} className={inputClass}>
              {FIELD_TYPES.map((value) => <option key={value} value={value}>{FIELD_TYPE_LABEL[value]}</option>)}
            </select>
          </label>
          <button type="submit" disabled={!name.trim() || run.isPending} className={`h-9 ${smallButton} px-3 text-sm`}>Add field</button>
          {type === "select" ? (
            <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-3">
              Options, separated by commas
              <input value={options} onChange={(event) => setOptions(event.target.value)} placeholder="Low, Medium, High" className={inputClass} />
            </label>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

function OptionEditor({ field, canWrite, disabled, onSave }: {
  field: ProjectField;
  canWrite: boolean;
  disabled: boolean;
  onSave: (options: Array<{ id?: string; name: string }>) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {field.options.map((option) => (
        <span key={option.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] px-2 py-0.5 text-xs text-[var(--foreground)]">
          {option.name}
          {canWrite ? (
            <button type="button" disabled={disabled} aria-label={`Remove option ${option.name}`} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              onClick={() => onSave(field.options.filter((o) => o.id !== option.id))}>
              ×
            </button>
          ) : null}
        </span>
      ))}
      {canWrite ? (
        <form className="inline-flex gap-1" onSubmit={(event) => {
          event.preventDefault();
          if (!draft.trim()) return;
          onSave([...field.options, { name: draft.trim() }]);
          setDraft("");
        }}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={40} aria-label={`New option for ${field.name}`}
            placeholder="Add option" className="h-7 w-28 border border-[var(--hairline)] bg-[var(--surface)] px-2 text-xs text-[var(--foreground)]" />
        </form>
      ) : null}
    </div>
  );
}

/** Field values as small chips on a task row. */
export function TaskFieldChips({ projectId, values, members }: { projectId: string | null; values: FieldValues | undefined; members: WorkspaceMember[] }) {
  const fields = useFields(projectId).data?.fields ?? [];
  if (!values || !Object.keys(values).length || !fields.length) return null;
  const names = new Map(members.map((member) => [member.userId, member.displayName]));
  return (
    <>
      {fields.map((field) => {
        const text = formatFieldValue(field, values[field.id], names);
        return text ? (
          <span key={field.id} className="max-w-48 truncate rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
            {field.name}: <span className="text-[var(--foreground)]">{text}</span>
          </span>
        ) : null;
      })}
    </>
  );
}

/** One input per project field, for the task drawer. `onChange` gets null to clear. */
export function TaskFieldsEditor({ projectId, values, members, disabled, onChange, labelClassName, className }: {
  projectId: string;
  values: FieldValues;
  members: WorkspaceMember[];
  disabled: boolean;
  onChange: (fieldId: string, value: FieldValue | null) => void;
  labelClassName?: string;
  className?: string;
}) {
  const fields = useFields(projectId).data?.fields ?? [];
  if (!fields.length) return null;
  return (
    <>
      {fields.map((field) => {
        const value = values[field.id];
        // Named directly: a label's whole text would take in a select's options.
        const common = { "aria-label": field.name, disabled, className };
        let input;
        switch (field.type) {
          case "text":
            input = <input key={String(value ?? "")} {...common} defaultValue={value === undefined ? "" : String(value)} maxLength={500}
              onBlur={(event) => { if (event.target.value.trim() !== (value ?? "")) onChange(field.id, event.target.value.trim() || null); }} />;
            break;
          case "number":
            input = <input key={String(value ?? "")} {...common} type="number" step="any" defaultValue={value === undefined ? "" : String(value)}
              onBlur={(event) => {
                const raw = event.target.value;
                const next = raw === "" ? null : Number(raw);
                if (next !== (value ?? null) && (next === null || Number.isFinite(next))) onChange(field.id, next);
              }} />;
            break;
          case "select":
            input = (
              <select {...common} value={value === undefined ? "" : String(value)} onChange={(event) => onChange(field.id, event.target.value || null)}>
                <option value="">—</option>
                {field.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            );
            break;
          case "date":
            input = <input {...common} type="date" value={isoToDateInput(value === undefined ? null : String(value))}
              onChange={(event) => onChange(field.id, dateInputToIso(event.target.value))} />;
            break;
          case "person":
            input = (
              <select {...common} value={value === undefined ? "" : String(value)} onChange={(event) => onChange(field.id, event.target.value || null)}>
                <option value="">—</option>
                {members.map((member) => <option key={member.userId} value={member.userId}>{member.displayName}</option>)}
              </select>
            );
            break;
        }
        return (
          <label key={field.id} className={labelClassName}>
            <span>{field.name}</span>
            {input}
          </label>
        );
      })}
    </>
  );
}
