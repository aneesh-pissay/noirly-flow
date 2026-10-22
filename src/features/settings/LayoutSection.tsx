"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { readLayout, type ContentWidth, type Density, type LayoutPrefs } from "@/src/core/layout-prefs";

type Me = Awaited<ReturnType<typeof api.me>>;

const DENSITY_CHOICES: Array<{ value: Density; label: string; hint: string }> = [
  { value: "comfortable", label: "Comfortable", hint: "Room around each task" },
  { value: "compact", label: "Compact", hint: "More tasks on screen" },
];
const WIDTH_CHOICES: Array<{ value: ContentWidth; label: string; hint: string }> = [
  { value: "standard", label: "Standard", hint: "Pages stay a readable width" },
  { value: "wide", label: "Wide", hint: "Lists and boards use the whole window" },
];

function Choice<T extends string>({ name, value, choices, onChange }: {
  name: string;
  value: T;
  choices: Array<{ value: T; label: string; hint: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2 sm:grid-cols-2">
      {choices.map((choice) => (
        <button key={choice.value} type="button" role="radio" aria-checked={value === choice.value} onClick={() => onChange(choice.value)}
          className={cn("rounded-xl border px-3 py-2 text-left", value === choice.value ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--hairline)] hover:bg-[var(--surface-2)]")}>
          <span className="block text-sm text-[var(--foreground)]">{choice.label}</span>
          <span className="block text-xs text-[var(--muted-foreground)]">{choice.hint}</span>
        </button>
      ))}
    </div>
  );
}

/** Settings → Layout: density and page width. They follow the account and apply at once. */
export function LayoutSection({ me }: { me: Me }) {
  const queryClient = useQueryClient();
  const layout = readLayout(me.user.profile);
  const save = useMutation({
    mutationFn: (patch: Partial<LayoutPrefs>) => api.updateMe(patch),
    // Applied straight away (LayoutPreferences watches the profile); put back if refused.
    onMutate: (patch) => {
      const previous = queryClient.getQueryData<Me>(["me"]);
      queryClient.setQueryData<Me>(["me"], (old) => (old ? { ...old, user: { ...old.user, profile: { ...old.user.profile, ...patch } } } : old));
      return { previous };
    },
    onSuccess: (data) => queryClient.setQueryData(["me"], data),
    onError: (_err, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(["me"], context.previous);
    },
  });

  return (
    <section aria-labelledby="layout-title" className="border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <h2 id="layout-title" className="text-sm font-medium text-[var(--foreground)]">Layout</h2>
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">How tightly task lists and boards are packed, and how wide pages get.</p>
      <p className="mt-4 text-xs text-[var(--muted-foreground)]">Density</p>
      <div className="mt-1"><Choice name="Density" value={layout.density} choices={DENSITY_CHOICES} onChange={(density) => save.mutate({ density })} /></div>
      <p className="mt-4 text-xs text-[var(--muted-foreground)]">Page width</p>
      <div className="mt-1"><Choice name="Page width" value={layout.contentWidth} choices={WIDTH_CHOICES} onChange={(contentWidth) => save.mutate({ contentWidth })} /></div>
      <p role="status" className="mt-2 text-xs text-[var(--muted-foreground)]">
        {save.isPending ? "Saving…" : save.isError ? "Couldn't save that; try again." : "Follows your account on every device."}
      </p>
    </section>
  );
}
