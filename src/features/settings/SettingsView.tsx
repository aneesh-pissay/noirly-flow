"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Input, Label, PageContainer, PageHeader, Textarea } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { CalendarFeedSection } from "@/src/features/settings/CalendarFeedSection";
import { AccessTokensSection } from "@/src/features/settings/AccessTokensSection";
import { InstallAppSection } from "@/src/features/settings/InstallAppSection";
import { LayoutSection } from "@/src/features/settings/LayoutSection";
import { CalendarSyncSection } from "@/src/features/settings/CalendarSyncSection";
import type { MePayload } from "@/src/server/users/me";

const TIMEZONES = [
  { value: "", label: "Not set" },
  { value: "UTC", label: "UTC" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/New_York", label: "Eastern Time" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Asia/Kolkata", label: "India (Kolkata)" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
];

type Props = {
  identityName: string;
  identityEmail: string;
  identityUrl: string;
  initialMe: MePayload;
};

export function SettingsView({
  identityName,
  identityEmail,
  identityUrl,
  initialMe,
}: Props) {
  const queryClient = useQueryClient();
  // Seeds the shared ["me"] cache that other screens read; the form itself
  // starts from the server-rendered profile.
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => api.me(),
    initialData: initialMe,
    staleTime: 60_000,
  });

  const initialProfile = initialMe.user.profile;
  const [displayName, setDisplayName] = useState(initialProfile.displayName ?? "");
  const [title, setTitle] = useState(initialProfile.title ?? "");
  const [timezone, setTimezone] = useState(initialProfile.timezone ?? "");
  const [bio, setBio] = useState(initialProfile.bio ?? "");
  const [saved, setSaved] = useState(false);
  const preferenceMutation = useMutation({
    mutationFn: (taskSaveMode: "auto" | "manual") => api.updateMe({ taskSaveMode }),
    onSuccess: (data) => queryClient.setQueryData(["me"], data),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateMe({
        displayName: displayName.trim() || null,
        title: title.trim() || null,
        timezone: timezone.trim() || null,
        bio: bio.trim() || null,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["me"], data);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    },
  });

  const identityHome = identityUrl.replace(/\/$/, "");

  return (
    <PageContainer size="sm" className="max-w-2xl">
      <PageHeader
        kicker="Account"
        title="Settings"
        lead="Sign-in details live in Noirly Identity. Optional Flow fields stay in this product only."
      />

      <section className="border border-[var(--hairline)] bg-[var(--surface)] p-5">
        <h2 className="text-sm font-medium text-[var(--foreground)]">Task saving</h2>
        <p id="task-save-help" className="mt-2 text-sm text-[var(--muted-foreground)]">
          New tasks always open a full form and are created when you choose Create task.
          Choose how changes in an existing task form are saved. Board moves, comments,
          attachments and other direct actions are applied immediately.
        </p>
        <label className="mt-4 block text-sm" htmlFor="task-save-mode">Save mode</label>
        <select id="task-save-mode" aria-describedby="task-save-help"
          value={meQuery.data.user.profile.taskSaveMode ?? "auto"}
          disabled={preferenceMutation.isPending}
          onChange={(event) => preferenceMutation.mutate(event.target.value as "auto" | "manual")}
          className="mt-1 h-10 w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-sm text-[var(--foreground)]">
          <option value="auto">Automatic — save task fields as you edit</option>
          <option value="manual">Manual — use Save changes</option>
        </select>
        <p role="status" className="mt-2 text-xs text-[var(--muted-foreground)]">
          {preferenceMutation.isPending ? "Saving preference…" : preferenceMutation.isSuccess ? "Preference saved" : "This preference follows your account."}
        </p>
        {preferenceMutation.isError ? <p role="alert">Could not save your preference. Please try again.</p> : null}
      </section>

      <LayoutSection me={meQuery.data} />

      <CalendarFeedSection timezone={meQuery.data.user.profile.timezone} />

      <CalendarSyncSection />

      <InstallAppSection />

      <AccessTokensSection />

      <section className="border border-[var(--hairline)] bg-[var(--surface)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              Noirly Identity
            </p>
            <h2 className="mt-1 text-sm font-medium text-[var(--foreground)]">
              Account
            </h2>
          </div>
          {identityHome ? (
            <a
              href={`${identityHome}/account`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Open Identity →
            </a>
          ) : null}
        </div>
        <dl className="mt-4 grid gap-3 font-mono text-xs text-[var(--muted-foreground)]">
          <div className="flex justify-between gap-4 border-b border-[var(--hairline)] pb-3">
            <dt>Name</dt>
            <dd className="text-[var(--foreground)]">{identityName || "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Email</dt>
            <dd className="text-[var(--foreground)]">{identityEmail || "—"}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Password, Google login, and account details are managed in Identity.
          Open Identity uses your Identity session when you are already signed
          in there.
        </p>
      </section>

      <section className="border border-[var(--hairline)] bg-[var(--surface)] p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
          Noirly Flow
        </p>
        <h2 className="mt-1 text-sm font-medium text-[var(--foreground)]">
          Profile
        </h2>
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Optional. Used in boards, comments, and members here. Other Noirly
          products keep their own profiles.
        </p>

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={identityName || "How you appear in Flow"}
              maxLength={80}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Role or title in this workspace"
              maxLength={80}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="timezone">Timezone</Label>
            <select
              id="timezone"
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="h-10 w-full rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-3 text-sm text-[var(--foreground)]"
            >
              {TIMEZONES.map((zone) => (
                <option key={zone.value || "none"} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="A short note about how you work"
              maxLength={280}
              rows={3}
            />
          </div>
          {saveMutation.isError ? (
            <p className="text-sm text-[var(--foreground)]" role="alert">
              {(saveMutation.error as Error).message}
            </p>
          ) : null}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save Flow profile"}
            </Button>
            {saved ? (
              <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                Saved
              </p>
            ) : null}
          </div>
        </form>
      </section>
    </PageContainer>
  );
}
