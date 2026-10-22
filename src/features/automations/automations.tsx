"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog } from "@noirly-dev/ui";
import { Zap } from "lucide-react";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import {
  MAX_STEPS, PRIORITY_LABEL, TASK_PRIORITIES, TASK_STATUSES, describeRule,
  type AutomationAction, type AutomationCondition, type AutomationRule, type AutomationTrigger, type RuleNames,
} from "@/src/core/automations";
import { useTags } from "@/src/features/tags/tags";
import { useSections } from "@/src/features/task/ProjectSections";
import { memberName } from "@/src/features/workspace/members";
import { useStatusNames } from "@/src/features/workspace/workspace-look";

const inputClass = "h-9 w-full border border-[var(--hairline)] bg-[var(--surface)] px-2 text-sm text-[var(--foreground)]";
const smallButton = "rounded-[var(--r-sm)] border border-[var(--hairline)] px-2 py-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50";

type Choice = { value: string; label: string };
type Lookups = { tags: Choice[]; people: Choice[]; sections: Choice[]; status: Record<(typeof TASK_STATUSES)[number], string> };

const CONDITION_TYPES: Array<{ type: AutomationCondition["type"]; label: string }> = [
  { type: "priority_is", label: "Priority is" },
  { type: "has_tag", label: "Has tag" },
  { type: "assigned_to", label: "Assigned to" },
  { type: "in_section", label: "In section" },
  { type: "title_contains", label: "Title contains" },
];

const ACTION_TYPES: Array<{ type: AutomationAction["type"]; label: string }> = [
  { type: "set_status", label: "Set status" },
  { type: "set_priority", label: "Set priority" },
  { type: "add_tag", label: "Add tag" },
  { type: "add_assignee", label: "Assign" },
  { type: "move_to_section", label: "Move to section" },
  { type: "set_due_in_days", label: "Due in days" },
];

type Step = { type: string; value: string };

/** What a step's value is picked from; null for free text or a number. */
function choicesFor(type: string, lookups: Lookups): Choice[] | null {
  switch (type) {
    case "priority_is":
    case "set_priority":
      return TASK_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }));
    case "set_status":
      return TASK_STATUSES.map((value) => ({ value, label: lookups.status[value] }));
    case "has_tag":
    case "add_tag":
      return lookups.tags;
    case "assigned_to":
    case "add_assignee":
      return lookups.people;
    case "in_section":
    case "move_to_section":
      return lookups.sections;
    default:
      return null;
  }
}

const firstValue = (type: string, lookups: Lookups) =>
  type === "set_due_in_days" ? "1" : choicesFor(type, lookups)?.[0]?.value ?? "";

function toStep(step: Step): AutomationCondition | AutomationAction {
  return { type: step.type, value: step.type === "set_due_in_days" ? Number(step.value) : step.value } as AutomationCondition | AutomationAction;
}

/** "Automations" in a project's header. */
export function ProjectAutomationsButton({ workspaceId, projectId, canWrite }: { workspaceId: string; projectId: string; canWrite: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--hairline)] px-3 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]">
        <Zap size={14} aria-hidden />
        Automations
      </button>
      <Dialog open={open} title="Automations" onClose={() => setOpen(false)}>
        {open ? <AutomationManager workspaceId={workspaceId} projectId={projectId} canWrite={canWrite} /> : null}
      </Dialog>
    </>
  );
}

function AutomationManager({ workspaceId, projectId, canWrite }: { workspaceId: string; projectId: string; canWrite: boolean }) {
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: qk.automations(projectId), queryFn: () => api.listAutomations(projectId) });
  const tags = useTags(workspaceId).data?.tags ?? [];
  const members = useQuery({ queryKey: qk.members(workspaceId), queryFn: () => api.listMembers(workspaceId) }).data?.members ?? [];
  const sections = useSections(projectId).data?.sections ?? [];
  const statusNames = useStatusNames();
  const lookups: Lookups = {
    tags: tags.map((tag) => ({ value: tag.id, label: `#${tag.name}` })),
    people: members.map((member) => ({ value: member.userId, label: member.displayName })),
    sections: sections.map((section) => ({ value: section.id, label: section.name })),
    status: statusNames,
  };
  const names: RuleNames = {
    tag: (id) => lookups.tags.find((tag) => tag.value === id)?.label ?? "a deleted tag",
    person: (id) => memberName(members, id),
    section: (id) => lookups.sections.find((section) => section.value === id)?.label ?? "a deleted section",
    status: statusNames,
  };

  const [error, setError] = useState<string | null>(null);
  const run = useMutation({
    mutationFn: (action: () => Promise<unknown>) => action(),
    onMutate: () => setError(null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.automations(projectId) }),
    onError: (err: Error) => setError(err.message),
  });

  // What the switch shows while its save is in flight (see flip).
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const toggle = useMutation({
    mutationFn: ({ ruleId, enabled }: { ruleId: string; enabled: boolean; previous: unknown }) => api.updateAutomation(ruleId, { enabled }),
    onError: (err: Error, vars) => {
      if (vars.previous) queryClient.setQueryData(qk.automations(projectId), vars.previous);
      setError(err.message);
    },
    onSettled: (_data, _error, vars) => {
      setShown((old) => {
        const next = { ...old };
        delete next[vars.ruleId];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: qk.automations(projectId) });
    },
  });
  // Flips in the click's own tick (a controlled checkbox snaps back otherwise), then drops any load of
  // the list in flight, which would land with the old value; rolls back if refused.
  function flip(ruleId: string, enabled: boolean) {
    setError(null);
    setShown((old) => ({ ...old, [ruleId]: enabled }));
    const previous = queryClient.getQueryData<{ rules: AutomationRule[] }>(qk.automations(projectId));
    queryClient.setQueryData<{ rules: AutomationRule[] }>(qk.automations(projectId), (old) =>
      old ? { rules: old.rules.map((rule) => (rule.id === ruleId ? { ...rule, enabled } : rule)) } : old);
    void queryClient.cancelQueries({ queryKey: qk.automations(projectId) });
    toggle.mutate({ ruleId, enabled, previous });
  }

  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<AutomationTrigger["type"]>("status_changed");
  const [to, setTo] = useState("done");
  const [conditions, setConditions] = useState<Step[]>([]);
  const [actions, setActions] = useState<Step[]>([{ type: "set_priority", value: "high" }]);

  const draftTrigger = (trigger === "status_changed" || trigger === "priority_changed"
    ? { type: trigger, to: to || null }
    : { type: trigger }) as AutomationTrigger;
  const complete = (steps: Step[]) => steps.every((step) => step.value !== "" && (step.type !== "set_due_in_days" || Number.isInteger(Number(step.value))));
  const ready = name.trim() && actions.length && complete(actions) && complete(conditions);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    run.mutate(() => api.createAutomation(projectId, {
      name: name.trim(),
      trigger: draftTrigger,
      conditions: conditions.map(toStep) as AutomationCondition[],
      actions: actions.map(toStep) as AutomationAction[],
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }), { onSuccess: () => { setName(""); setConditions([]); } });
  }

  const list = rules.data?.rules ?? [];
  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
      <p className="text-sm text-[var(--muted-foreground)]">Rules that change a task when something happens to it in this project. They run as whoever made the change, and changes they make don&apos;t set off other rules.</p>
      {error ? <p role="alert" className="text-sm text-[var(--accent)]">{error}</p> : null}
      {rules.isPending ? <p className="text-sm text-[var(--muted-foreground)]">Loading automations…</p> : null}
      {list.length ? (
        <ul aria-label="Automations" className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
          {list.map((rule) => (
            <li key={rule.id} data-rule={rule.name} className={`flex flex-col gap-1 py-3 ${(shown[rule.id] ?? rule.enabled) ? "" : "opacity-60"}`}>
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium text-[var(--foreground)]">{rule.name}</span>
                {canWrite ? (
                  <>
                    <label className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                      <input type="checkbox" checked={shown[rule.id] ?? rule.enabled} aria-label={`${rule.name} enabled`}
                        onChange={(event) => flip(rule.id, event.target.checked)} />
                      On
                    </label>
                    <button type="button" className={smallButton} disabled={run.isPending} aria-label={`Delete automation ${rule.name}`}
                      onClick={() => { if (window.confirm(`Delete “${rule.name}”?`)) run.mutate(() => api.deleteAutomation(rule.id)); }}>
                      Delete
                    </button>
                  </>
                ) : null}
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">{describeRule(rule, names)}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {rule.runCount ? `Ran ${rule.runCount} time${rule.runCount === 1 ? "" : "s"}` : "Hasn't run yet"}
              </p>
            </li>
          ))}
        </ul>
      ) : rules.data ? <p className="text-sm text-[var(--muted-foreground)]">No automations yet.</p> : null}

      {canWrite ? (
        <form onSubmit={submit} aria-label="New automation" className="flex flex-col gap-3 border border-[var(--hairline)] p-3">
          <label className="flex flex-col gap-1 text-xs text-[var(--muted-foreground)]">
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="e.g. Escalate finished work" className={inputClass} />
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">When</legend>
            <div className="flex gap-2">
              <select aria-label="Trigger" value={trigger} className={inputClass}
                onChange={(event) => { const next = event.target.value as AutomationTrigger["type"]; setTrigger(next); setTo(""); }}>
                <option value="created">A task is created</option>
                <option value="status_changed">Status changes</option>
                <option value="priority_changed">Priority changes</option>
                <option value="assignee_added">Someone is assigned</option>
              </select>
              {trigger === "status_changed" || trigger === "priority_changed" ? (
                <select aria-label="Changes to" value={to} onChange={(event) => setTo(event.target.value)} className={inputClass}>
                  <option value="">to anything</option>
                  {(trigger === "status_changed"
                    ? TASK_STATUSES.map((value) => ({ value, label: lookups.status[value] }))
                    : TASK_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }))
                  ).map((choice) => <option key={choice.value} value={choice.value}>to {choice.label}</option>)}
                </select>
              ) : null}
            </div>
          </fieldset>
          <StepList legend="If (all of these)" kind="condition" types={CONDITION_TYPES} steps={conditions} setSteps={setConditions} lookups={lookups} />
          <StepList legend="Then" kind="action" types={ACTION_TYPES} steps={actions} setSteps={setActions} lookups={lookups} />
          {ready ? (
            <p className="text-sm text-[var(--foreground)]">
              {describeRule({ trigger: draftTrigger, conditions: conditions.map(toStep) as AutomationCondition[], actions: actions.map(toStep) as AutomationAction[] }, names)}
            </p>
          ) : null}
          <button type="submit" disabled={!ready || run.isPending} className={`h-9 self-start ${smallButton} px-3 text-sm`}>Add automation</button>
        </form>
      ) : null}
    </div>
  );
}

function StepList({ legend, kind, types, steps, setSteps, lookups }: {
  legend: string;
  kind: "condition" | "action";
  types: Array<{ type: string; label: string }>;
  steps: Step[];
  setSteps: (steps: Step[]) => void;
  lookups: Lookups;
}) {
  const update = (index: number, next: Step) => setSteps(steps.map((step, i) => (i === index ? next : step)));
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">{legend}</legend>
      {steps.map((step, index) => {
        const choices = choicesFor(step.type, lookups);
        const n = index + 1;
        return (
          <div key={index} className="flex gap-2">
            <select aria-label={`${kind} ${n}`} value={step.type} className={inputClass}
              onChange={(event) => update(index, { type: event.target.value, value: firstValue(event.target.value, lookups) })}>
              {types.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
            </select>
            {choices ? (
              <select aria-label={`${kind} ${n} value`} value={step.value} className={inputClass} onChange={(event) => update(index, { ...step, value: event.target.value })}>
                {!choices.length ? <option value="">None to pick</option> : null}
                {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
              </select>
            ) : (
              <input aria-label={`${kind} ${n} value`} value={step.value} className={inputClass}
                type={step.type === "set_due_in_days" ? "number" : "text"} min={0} max={365} maxLength={100}
                onChange={(event) => update(index, { ...step, value: event.target.value })} />
            )}
            <button type="button" className={smallButton} aria-label={`Remove ${kind} ${n}`} onClick={() => setSteps(steps.filter((_, i) => i !== index))}>×</button>
          </div>
        );
      })}
      {steps.length < MAX_STEPS ? (
        <button type="button" className={`self-start ${smallButton}`}
          onClick={() => setSteps([...steps, { type: types[0]!.type, value: firstValue(types[0]!.type, lookups) }])}>
          + Add {kind}
        </button>
      ) : null}
    </fieldset>
  );
}
