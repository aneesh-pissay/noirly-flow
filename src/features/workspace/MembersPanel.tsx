"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button, Input } from "@noirly-dev/ui";
import { api } from "@/src/lib/api-client";
import { qk } from "@/src/core/sync/query-keys";
import type { MemberRole } from "@/src/core/models/enums";

const ROLES: MemberRole[] = ["owner", "admin", "member", "viewer"];
const INVITE_ROLES: Array<Exclude<MemberRole, "owner">> = [
  "admin",
  "member",
  "viewer",
];

type Props = {
  workspaceId: string;
  currentUserId: string;
  canManage: boolean;
};

export function MembersPanel({ workspaceId, currentUserId, canManage }: Props) {
  const queryClient = useQueryClient();
  const [inviteRole, setInviteRole] = useState<Exclude<MemberRole, "owner">>("member");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailRole, setEmailRole] = useState<Exclude<MemberRole, "owner">>("member");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  const membersQuery = useQuery({
    queryKey: qk.members(workspaceId),
    queryFn: () => api.listMembers(workspaceId),
  });

  const inviteMutation = useMutation({
    mutationFn: () => api.createInvite(workspaceId, inviteRole),
    onSuccess: (result) => {
      setInviteUrl(result.invite.url);
      setCopied(false);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const emailMutation = useMutation({
    mutationFn: () => api.emailInvite(workspaceId, email.trim(), emailRole),
    onSuccess: (result) => {
      setSentTo(result.invite.email);
      setEmail("");
      setError(null);
    },
    onError: () => setSentTo(null),
  });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: MemberRole }) =>
      api.updateMember(workspaceId, userId, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.removeMember(workspaceId, userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.members(workspaceId) });
    },
    onError: (err: Error) => setError(err.message),
  });

  const members = membersQuery.data?.members ?? [];

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <section
          aria-labelledby="invite-email-title"
          className="border border-[var(--hairline)] bg-[var(--surface)] p-4"
        >
          <h2 id="invite-email-title" className="text-sm font-medium text-[var(--foreground)]">
            Invite by email
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            We&apos;ll email them a one-time link. Only that address can accept it, and it
            expires in 7 days.
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!email.trim()) return;
              emailMutation.mutate();
            }}
          >
            <Input
              type="email"
              required
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setSentTo(null);
              }}
              placeholder="name@company.com"
              aria-label="Email address"
              autoComplete="off"
              className="h-10 min-w-[14rem] flex-1"
            />
            <select
              value={emailRole}
              aria-label="Role for emailed invite"
              onChange={(event) =>
                setEmailRole(event.target.value as Exclude<MemberRole, "owner">)
              }
              className="h-10 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-2 text-sm text-[var(--foreground)]"
            >
              {INVITE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={emailMutation.isPending || !email.trim()}>
              {emailMutation.isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
          {sentTo ? (
            <p role="status" className="mt-3 font-mono text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
              Invitation sent to {sentTo}
            </p>
          ) : null}
          {emailMutation.isError ? (
            <p role="alert" className="mt-3 text-sm text-[var(--foreground)]">
              {emailMutation.error.message}
            </p>
          ) : null}
        </section>
      ) : null}

      {canManage ? (
        <section
          aria-labelledby="invite-link-title"
          className="border border-[var(--hairline)] bg-[var(--surface)] p-4"
        >
          <h2 id="invite-link-title" className="text-sm font-medium text-[var(--foreground)]">
            Invite link
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Copy a one-time link. It expires in 7 days.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={inviteRole}
              aria-label="Role for invite link"
              onChange={(event) =>
                setInviteRole(event.target.value as Exclude<MemberRole, "owner">)
              }
              className="h-10 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-2 text-sm text-[var(--foreground)]"
            >
              {INVITE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <Button
              type="button"
              onClick={() => inviteMutation.mutate()}
            >
              Generate link
            </Button>
          </div>
          {inviteUrl ? (
            <div className="mt-3 flex gap-2">
              <Input readOnly value={inviteUrl} className="h-10 flex-1 truncate text-xs" />
              <Button
                type="button"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="overflow-hidden border border-[var(--hairline)] bg-[var(--surface)]">
        <table className="w-full text-left text-sm">
          <thead className="font-mono text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            <tr className="border-b border-[var(--hairline)]">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Role</th>
              {canManage ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {membersQuery.isPending || membersQuery.isError ? (
              <tr>
                <td
                  colSpan={canManage ? 3 : 2}
                  className="px-4 py-3 text-sm text-[var(--muted-foreground)]"
                >
                  {membersQuery.isPending ? (
                    "Loading members…"
                  ) : (
                    <span role="alert">
                      Could not load members.{" "}
                      <button
                        type="button"
                        onClick={() => void membersQuery.refetch()}
                        className="text-[var(--foreground)] hover:underline"
                      >
                        Try again
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ) : null}
            {members.map((member) => (
              <tr
                key={member.userId}
                className="border-b border-[var(--hairline)] last:border-0"
              >
                <td className="px-4 py-3">
                  <p className="text-[var(--foreground)]">
                    {member.displayName}
                    {member.isCreator ? (
                      <span className="ml-2 rounded-full border border-[var(--accent)] px-1.5 py-0.5 align-middle font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--accent)]">
                        Creator
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {member.email}
                  </p>
                </td>
                <td className="px-4 py-3">
                  {canManage && member.userId !== currentUserId && !member.isCreator ? (
                    <select
                      value={member.role}
                      onChange={(event) =>
                        roleMutation.mutate({
                          userId: member.userId,
                          role: event.target.value as MemberRole,
                        })
                      }
                      className="h-9 rounded-xl border border-[var(--hairline)] bg-[var(--bg)] px-2 text-xs text-[var(--foreground)]"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-mono text-xs uppercase text-[var(--muted-foreground)]">
                      {member.role}
                    </span>
                  )}
                </td>
                {canManage ? (
                  <td className="px-4 py-3 text-right">
                    {member.userId !== currentUserId && !member.isCreator ? (
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(member.userId)}
                        className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                      >
                        Remove
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {error ? (
        <p className="text-sm text-[var(--foreground)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
