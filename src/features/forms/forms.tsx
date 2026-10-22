"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@noirly-dev/ui";
import { ClipboardList } from "lucide-react";
import { api, type FormBody } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import { QUESTION_KINDS, QUESTION_KIND_LABEL, type IntakeForm, type QuestionKind } from "@/src/core/forms";
import { PRIORITY_LABEL, TASK_PRIORITIES } from "@/src/core/automations";
import { useTags } from "@/src/features/tags/tags";
import { useSections } from "@/src/features/task/ProjectSections";

const inputClass = "h-9 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)]";
const smallButton = "rounded-[var(--r-sm)] border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50";
const labelClass = "flex flex-col gap-1 text-xs text-[var(--muted-foreground)]";
const formsKey = (projectId: string) => ["forms", projectId] as const;

type DraftQuestion = { id?: string; label: string; kind: QuestionKind; required: boolean; options: string };

const blank = (): FormBody & { questionsDraft: DraftQuestion[] } => ({
  name: "", intro: null, titleLabel: "What do you need?", askDetails: true, questions: [], questionsDraft: [],
  defaults: { priority: "none", sectionId: null, tagIds: [], assigneeId: null }, confirmation: null, enabled: true,
});

function fromForm(form: IntakeForm) {
  return {
    ...blank(),
    name: form.name, intro: form.intro, titleLabel: form.titleLabel, askDetails: form.askDetails,
    defaults: form.defaults, confirmation: form.confirmation, enabled: form.enabled,
    questionsDraft: form.questions.map((q) => ({ id: q.id, label: q.label, kind: q.kind, required: q.required, options: q.options.join(", ") })),
  };
}

/** "Forms" in a project's header. */
export function ProjectFormsButton({ workspaceId, projectId, canWrite }: { workspaceId: string; projectId: string; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]">
        <ClipboardList size={14} aria-hidden />
        Forms
      </button>
      <Dialog open={open} title="Intake forms" onClose={() => setOpen(false)}>
        {open ? <FormManager workspaceId={workspaceId} projectId={projectId} canWrite={canWrite} /> : null}
      </Dialog>
    </>
  );
}

function FormManager({ workspaceId, projectId, canWrite }: { workspaceId: string; projectId: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const forms = useQuery({ queryKey: formsKey(projectId), queryFn: () => api.listForms(projectId) });
  const [editing, setEditing] = useState<{ id: string | null; draft: ReturnType<typeof blank> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => setError(null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: formsKey(projectId) }),
    onError: (err: Error) => setError(err.message),
  });
  // What the switch shows while its save is in flight (see flip).
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const toggle = useMutation({
    mutationFn: ({ formId, enabled }: { formId: string; enabled: boolean; previous: unknown }) => api.updateForm(formId, { enabled }),
    onError: (err: Error, vars) => {
      if (vars.previous) queryClient.setQueryData(formsKey(projectId), vars.previous);
      setError(err.message);
    },
    onSettled: (_data, _error, vars) => {
      setShown((old) => {
        const next = { ...old };
        delete next[vars.formId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: formsKey(projectId) });
    },
  });
  // Flips in the click's own tick (a controlled checkbox snaps back otherwise), then drops any load of
  // the list in flight, which would land with the old value; rolls back if refused.
  function flip(formId: string, enabled: boolean) {
    setError(null);
    setShown((old) => ({ ...old, [formId]: enabled }));
    const previous = queryClient.getQueryData<{ forms: IntakeForm[] }>(formsKey(projectId));
    queryClient.setQueryData<{ forms: IntakeForm[] }>(formsKey(projectId), (old) =>
      old ? { forms: old.forms.map((form) => (form.id === formId ? { ...form, enabled } : form)) } : old);
    void queryClient.cancelQueries({ queryKey: formsKey(projectId) });
    toggle.mutate({ formId, enabled, previous });
  }
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  if (editing) {
    return <FormEditor workspaceId={workspaceId} projectId={projectId} initial={editing.draft} saving={run.isPending} error={error}
      onCancel={() => { setEditing(null); setError(null); }}
      onSave={(body) => run.mutate(() => (editing.id ? api.updateForm(editing.id, body) : api.createForm(projectId, body)), { onSuccess: () => setEditing(null) })} />;
  }

  const list = forms.data?.forms ?? [];
  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
      <p className="text-sm text-[var(--muted-foreground)]">
        Share a link anyone can fill in, no account needed. Each response becomes a task in this project, created as you.
      </p>
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      {forms.isPending ? <p className="text-sm text-[var(--muted-foreground)]">Loading forms…</p> : null}
      {list.length ? (
        <ul aria-label="Forms" className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          {list.map((form) => {
            const link = `${origin}/f/${form.publicId}`;
            const enabled = shown[form.id] ?? form.enabled;
            return (
              <li key={form.id} data-form={form.name} className={`flex flex-col gap-2 py-3 ${enabled ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-sm font-medium text-[var(--foreground)]">{form.name}</span>
                  {canWrite ? (
                    <label className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                      <input type="checkbox" checked={enabled} aria-label={`${form.name} taking responses`}
                        onChange={(event) => flip(form.id, event.target.checked)} />
                      Open
                    </label>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <input readOnly value={link} aria-label={`Link to ${form.name}`} onFocus={(event) => event.currentTarget.select()}
                    className="h-8 min-w-0 flex-1 border border-[var(--hairline)] bg-[var(--bg)] px-2 font-mono text-[11px] text-[var(--foreground)]" />
                  <button type="button" className={smallButton} onClick={() => void navigator.clipboard.writeText(link)}>Copy</button>
                  <a href={link} target="_blank" rel="noreferrer" className={smallButton}>Open</a>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {form.submissionCount ? `${form.submissionCount} response${form.submissionCount === 1 ? "" : "s"}` : "No responses yet"}
                  {` · ${form.questions.length + 1 + (form.askDetails ? 1 : 0)} questions`}
                </p>
                {canWrite ? (
                  <div className="flex gap-2">
                    <button type="button" className={smallButton} onClick={() => setEditing({ id: form.id, draft: fromForm(form) })}>Edit</button>
                    <button type="button" className={smallButton} disabled={run.isPending} aria-label={`Delete form ${form.name}`}
                      onClick={() => { if (window.confirm(`Delete “${form.name}”? Its link stops working; tasks it made stay.`)) run.mutate(() => api.deleteForm(form.id)); }}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : forms.data ? <p className="text-sm text-[var(--muted-foreground)]">No forms yet.</p> : null}
      {canWrite ? (
        <button type="button" className={`self-start ${smallButton} px-3 py-1.5 text-sm`} onClick={() => setEditing({ id: null, draft: blank() })}>New form</button>
      ) : null}
    </div>
  );
}

function FormEditor({ workspaceId, projectId, initial, saving, error, onSave, onCancel }: {
  workspaceId: string;
  projectId: string;
  initial: ReturnType<typeof blank>;
  saving: boolean;
  error: string | null;
  onSave: (body: FormBody) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const tags = useTags(workspaceId).data?.tags ?? [];
  const sections = useSections(projectId).data?.sections ?? [];
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) }).data?.members ?? [];
  const set = (patch: Partial<typeof draft>) => setDraft((old) => ({ ...old, ...patch }));
  const setDefaults = (patch: Partial<FormBody["defaults"]>) => setDraft((old) => ({ ...old, defaults: { ...old.defaults, ...patch } }));
  const setQuestion = (index: number, patch: Partial<DraftQuestion>) =>
    set({ questionsDraft: draft.questionsDraft.map((q, i) => (i === index ? { ...q, ...patch } : q)) });

  function submit(event: FormEvent) {
    event.preventDefault();
    const { questionsDraft, ...rest } = draft;
    onSave({
      ...rest,
      name: rest.name.trim(),
      questions: questionsDraft.map((q) => ({
        ...(q.id ? { id: q.id } : {}), label: q.label.trim(), kind: q.kind, required: q.required,
        options: q.kind === "choice" ? q.options.split(",").map((o) => o.trim()).filter(Boolean) : [],
      })),
    });
  }

  const ready = draft.name.trim() && draft.titleLabel.trim() && draft.questionsDraft.every((q) => q.label.trim());
  return (
    <form onSubmit={submit} aria-label="Edit form" className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      <label className={labelClass}>Form name
        <input value={draft.name} onChange={(event) => set({ name: event.target.value })} maxLength={80} placeholder="e.g. Report a bug" className={inputClass} />
      </label>
      <label className={labelClass}>Intro (optional)
        <textarea value={draft.intro ?? ""} onChange={(event) => set({ intro: event.target.value })} maxLength={2000} rows={2}
          className="w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--foreground)]" />
      </label>
      <label className={labelClass}>Question that becomes the task title
        <input value={draft.titleLabel} onChange={(event) => set({ titleLabel: event.target.value })} maxLength={120} className={inputClass} />
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
        <input type="checkbox" checked={draft.askDetails} onChange={(event) => set({ askDetails: event.target.checked })} />
        Ask for details (they start the task description)
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">More questions</legend>
        {draft.questionsDraft.map((q, index) => {
          const n = index + 1;
          return (
            <div key={q.id ?? `new-${index}`} className="flex flex-col gap-1.5 border border-[var(--hairline)] p-2">
              <div className="flex gap-2">
                <input aria-label={`Question ${n}`} value={q.label} maxLength={120} placeholder="Question" className={inputClass}
                  onChange={(event) => setQuestion(index, { label: event.target.value })} />
                <select aria-label={`Question ${n} type`} value={q.kind} className={`${inputClass} w-36`}
                  onChange={(event) => setQuestion(index, { kind: event.target.value as QuestionKind })}>
                  {QUESTION_KINDS.map((kind) => <option key={kind} value={kind}>{QUESTION_KIND_LABEL[kind]}</option>)}
                </select>
                <button type="button" className={smallButton} aria-label={`Remove question ${n}`}
                  onClick={() => set({ questionsDraft: draft.questionsDraft.filter((_, i) => i !== index) })}>×</button>
              </div>
              {q.kind === "choice" ? (
                <input aria-label={`Question ${n} choices`} value={q.options} placeholder="Choices, separated by commas" className={inputClass}
                  onChange={(event) => setQuestion(index, { options: event.target.value })} />
              ) : null}
              <label className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                <input type="checkbox" checked={q.required} onChange={(event) => setQuestion(index, { required: event.target.checked })} />
                Required
              </label>
            </div>
          );
        })}
        {draft.questionsDraft.length < 15 ? (
          <button type="button" className={`self-start ${smallButton}`}
            onClick={() => set({ questionsDraft: [...draft.questionsDraft, { label: "", kind: "short_text", required: false, options: "" }] })}>
            + Add question
          </button>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">New tasks get</legend>
        <label className={labelClass}>Priority
          <select value={draft.defaults.priority} onChange={(event) => setDefaults({ priority: event.target.value as FormBody["defaults"]["priority"] })} className={inputClass}>
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </select>
        </label>
        <label className={labelClass}>Assignee
          <select value={draft.defaults.assigneeId ?? ""} onChange={(event) => setDefaults({ assigneeId: event.target.value || null })} className={inputClass}>
            <option value="">Nobody</option>
            {members.map((m) => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
          </select>
        </label>
        {sections.length ? (
          <label className={labelClass}>Section
            <select value={draft.defaults.sectionId ?? ""} onChange={(event) => setDefaults({ sectionId: event.target.value || null })} className={inputClass}>
              <option value="">No section</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        ) : null}
        {tags.length ? (
          <div className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
            <span>Tags</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {tags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-1 text-sm text-[var(--foreground)]">
                  <input type="checkbox" checked={draft.defaults.tagIds.includes(tag.id)}
                    onChange={(event) => setDefaults({ tagIds: event.target.checked ? [...draft.defaults.tagIds, tag.id] : draft.defaults.tagIds.filter((id) => id !== tag.id) })} />
                  #{tag.name}
                </label>
              ))}
            </div>
          </div>
        ) : null}
      </fieldset>

      <label className={labelClass}>Message after sending (optional)
        <input value={draft.confirmation ?? ""} onChange={(event) => set({ confirmation: event.target.value })} maxLength={500} placeholder="Thanks! We'll get back to you." className={inputClass} />
      </label>
      <div className="flex gap-2">
        <button type="submit" disabled={!ready || saving} className={`${smallButton} px-3 py-1.5 text-sm`}>Save form</button>
        <button type="button" className={`${smallButton} px-3 py-1.5 text-sm`} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
