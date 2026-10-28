import type { DocArticle } from "@/src/docs/types";

const ROLES = "Viewer < Member < Admin < Owner";

export const workspaces: DocArticle[] = [
  {
    id: "workspaces",
    category: "workspaces",
    kind: "feature",
    title: "Workspaces",
    summary: "Your private Personal workspace and shared team workspaces, each with its own projects and people.",
    location: "Main sidebar → Workspaces",
    introduction:
      "A workspace is the top-level container in Flow. You always have a Personal workspace that only you can see. Team workspaces are shared: everyone in one sees its projects and tasks, within their role. Open a workspace and Flow jumps to its first project.",
    problem:
      "Mixing personal errands with team work in one list leaks private items and clutters everyone's view; keeping them in separate apps means two accounts and two habits.",
    solution:
      "Flow separates work by workspace inside one app. Personal is private by design and can't be renamed, shared or deleted. Team workspaces come with a starter project (General with Todo, In progress and Done), roles, invites and their own settings, and you switch between them from the sidebar or the command palette.",
    highlights: [
      "A Personal workspace created on first sign-in",
      "Team workspaces created in two clicks",
      "Each workspace has its own projects, tags, templates and settings",
      "The creator is the owner and can't be removed by others",
    ],
    useCases: [
      { title: "Side project with a friend", body: "Create a team workspace, invite them as a Member, and keep your own errands in Personal." },
      { title: "Agency with several clients", body: "One team workspace per client keeps people, tags and automations apart." },
    ],
    steps: [
      { title: "Create a team workspace", body: "In the main sidebar, choose New team workspace, type a team name and choose Create.", shot: "create" },
      { title: "Open it", body: "Click the new workspace. Flow opens its first project, General.", shot: "general" },
      { title: "Rename it", body: "Go to Workspace (main sidebar) → General, change Workspace name and choose Save." },
      { title: "Delete it", body: "Owners only: Workspace → Danger zone, type the workspace's name to confirm, then Delete workspace." },
    ],
    options: [
      { name: "New team workspace", description: "Creates a team workspace; you become its owner. A General project is added with three columns." },
      { name: "Workspace name", description: "Rename a team workspace (admins). Personal can't be renamed." },
      { name: "Delete workspace", description: "Owner only, after typing the name. Personal can't be deleted." },
    ],
    permissions: [
      { who: "Viewer", can: "See the workspace and everything in it." },
      { who: "Member", can: "Create and edit tasks and projects." },
      { who: "Admin", can: "Rename the workspace, manage members and settings, delete projects." },
      { who: "Owner", can: "Everything, including deleting the workspace." },
    ],
    advanced: [
      `Roles rank ${ROLES}; every API route checks the role, not just the UI.`,
      "The workspace root URL `/w/<id>` always opens the first unarchived project.",
      "The creator of a team keeps owner rights: other owners can't demote or remove them.",
    ],
    troubleshooting: [
      { problem: "Delete workspace is greyed out", solution: "Type the workspace's exact name in the confirmation box first. Only owners see the button." },
      { problem: "I can't rename Personal", solution: "That's by design: Personal is private and fixed. Its look and defaults can still be changed in Workspace settings." },
    ],
    related: ["members-and-roles", "invites", "workspace-settings", "projects"],
    sources: ["src/features/workspace/CreateTeamWorkspace.tsx", "src/features/workspace/WorkspaceSettingsView.tsx", "src/server/workspace", "app/api/workspaces", "src/core/permissions", "app/(app)/w/[workspaceId]/page.tsx"],
    keywords: ["team", "personal", "organisation", "organization"],
    video: { scenario: "workspaces" },
  },
  {
    id: "members-and-roles",
    category: "workspaces",
    kind: "feature",
    title: "Members and roles",
    summary: "See who's in a workspace, change their role, or remove them.",
    location: "Main sidebar → Members",
    introduction:
      "The Members page lists everyone in the workspace with their name, email and role. Admins and owners change roles from a dropdown or remove people. Roles decide what each person can do across the whole workspace.",
    problem: "Shared boards fall apart when anyone can delete anything, or when there's no way to give a client read-only access.",
    solution:
      "Flow has four roles — Viewer, Member, Admin and Owner — enforced on the server for every request. Viewers see everything and change nothing, which makes them ideal for clients and stakeholders. Guard rails stop a workspace from losing its last owner or its creator.",
    highlights: ["Four roles enforced on every API call", "Viewers get a clear read-only banner", "Remove access instantly", "The creator is protected"],
    useCases: [
      { title: "Client visibility", body: "Invite a client as a Viewer so they can follow the board without moving cards." },
      { title: "Handing over", body: "Promote a colleague to Owner before you step back from a team." },
    ],
    steps: [
      { title: "Open Members", body: "In the main sidebar, choose Members.", shot: "table" },
      { title: "Change a role", body: "Pick a new role in the person's Role dropdown. It applies immediately." },
      { title: "Remove someone", body: "Choose Remove on their row. They lose access at once." },
    ],
    options: [
      { name: "Role", description: "Viewer, Member, Admin or Owner. Only an owner can make someone an owner." },
      { name: "Remove", description: "Takes the person out of the workspace. You can't remove yourself." },
      { name: "Creator", description: "Marks the person who made the workspace; their role can't be changed by others." },
    ],
    permissions: [
      { who: "Viewer", can: "See the member list; can't change it. Sees “You have view-only access” on projects." },
      { who: "Member", can: "See the member list; can't change it." },
      { who: "Admin", can: "Change roles (except to owner), remove people, invite." },
      { who: "Owner", can: "Everything admins can, plus make owners." },
    ],
    advanced: [
      "You can't change your own role, and the last owner can't be demoted.",
      "A team linked to a Noirly space manages its people in the space instead; see Spaces.",
      "Each member also has working hours used by Capacity.",
    ],
    troubleshooting: [
      { problem: "There's no Role dropdown on a row", solution: "You need Admin or Owner, and the creator's row is locked." },
      { problem: "A removed person still sees the workspace", solution: "Their next request is refused; ask them to reload." },
    ],
    related: ["invites", "workspaces", "spaces", "capacity"],
    sources: ["src/features/workspace/MembersView.tsx", "src/features/workspace/MembersPanel.tsx", "src/features/workspace/members.ts", "src/core/permissions", "app/api/workspaces/[workspaceId]/members", "app/(app)/w/[workspaceId]/members"],
    keywords: ["rbac", "permissions", "viewer", "admin", "owner", "access"],
    video: { scenario: "members-and-roles" },
  },
  {
    id: "invites",
    category: "workspaces",
    kind: "feature",
    title: "Invites",
    summary: "Invite people with a one-time link or by email, and revoke invites that haven't been used.",
    location: "Main sidebar → Members",
    introduction:
      "Admins add people to a team workspace in two ways: generate a one-time invite link to send however you like, or email an invite to a specific address. Either way you choose the role they'll join with. Pending invites are listed so you can revoke them.",
    problem: "Sharing a permanent join link means anyone who sees it can get in, forever.",
    solution:
      "Every Flow invite is single-use and expires after 7 days; only a hash of it is stored. Emailed invites work only for the address they were sent to. Revoking an invite kills its link immediately, and opening a dead link explains what happened.",
    highlights: ["One-time links that expire in 7 days", "Email invites tied to one address", "Pending list with Revoke", "Sign-in handled for invitees"],
    useCases: [
      { title: "Onboarding a new hire", body: "Send an email invite as Member on their first morning." },
      { title: "Sharing in a chat", body: "Generate a Viewer link and paste it into your team chat." },
    ],
    steps: [
      { title: "Open Members", body: "In the main sidebar, choose Members." },
      { title: "Invite by email", body: "Type the Email address, pick the Role for emailed invite, and choose Send invite.", shot: "email" },
      { title: "Or generate a link", body: "Pick the Role for invite link and choose Generate link, then copy the link that appears.", shot: "link" },
      { title: "Revoke if needed", body: "Under Pending invites, choose Revoke on any invite that's no longer wanted.", shot: "pending" },
    ],
    options: [
      { name: "Email address · Send invite", description: "Emails a one-time link that only that address can accept." },
      { name: "Role for invite link · Generate link", description: "Makes a one-time link for Admin, Member or Viewer." },
      { name: "Pending invites", description: "Unused, unexpired invites with their role and expiry; Revoke kills one." },
    ],
    permissions: [
      { who: "Admin, Owner", can: "Send, generate and revoke invites." },
      { who: "Member, Viewer", can: "Can't invite." },
      { who: "Invitee", can: "Accepts while signed in; signed-out invitees go through sign-in and come back." },
    ],
    advanced: [
      "Emailed invites are rate-limited.",
      "Opening an invite to a workspace you're already in says so instead of failing.",
      "Teams linked to a Noirly space don't show invite controls; people join through the space.",
    ],
    troubleshooting: [
      { problem: "“Invite failed” when opening a link", solution: "The link was already used, revoked, expired, or was emailed to a different address. Ask for a new one." },
      { problem: "“… is already a member”", solution: "That person is in the workspace already; change their role instead." },
      { problem: "The email never arrived", solution: "Check spam, or use Generate link. The server needs SMTP for emails." },
    ],
    related: ["members-and-roles", "workspaces", "signing-in", "spaces"],
    sources: ["src/features/workspace/MembersPanel.tsx", "src/server/mail/invite-mail.ts", "app/(app)/invite", "app/api/workspaces/[workspaceId]/invites", "app/api/invites"],
    keywords: ["invite link", "join", "email invite", "revoke"],
    video: { scenario: "invites" },
  },
  {
    id: "workspace-settings",
    category: "workspaces",
    kind: "feature",
    title: "Workspace settings",
    summary: "Name, icon and colour, default view, status names, tags, templates, data, webhooks and the danger zone.",
    location: "Main sidebar → Workspace",
    introduction:
      "Each workspace has a settings page with jump links to its sections: General, Appearance, Defaults, Statuses, Tags, Templates, Data, Space, Webhooks and Danger zone (the last few only where they apply). Changes apply to everyone in the workspace.",
    problem: "Every team talks about its work differently — “Backlog” instead of “Todo”, “Shipped” instead of “Done” — and a tool that can't follow along feels foreign.",
    solution:
      "Flow lets each workspace set its own look and vocabulary. Rename the four statuses and the new names appear in lists, the drawer, boards, automations and new projects' columns. Pick an emoji icon on a colour for the sidebar, and choose which view new projects open in.",
    highlights: ["Emoji icon on a colour", "Rename the four statuses", "Default view for new projects", "Tags, templates, data and webhooks in one place"],
    useCases: [
      { title: "Make it yours", body: "Give the team a 🚀 on green so it stands out in the sidebar." },
      { title: "Match your process", body: "Rename Todo to Backlog and Done to Shipped." },
    ],
    steps: [
      { title: "Open Workspace settings", body: "In the main sidebar, choose Workspace.", shot: "page" },
      { title: "Set the appearance", body: "Under Appearance, pick an icon and a colour.", shot: "appearance" },
      { title: "Choose a default view", body: "Under Defaults, set Default view for new projects (list, board, calendar or Gantt)." },
      { title: "Rename statuses", body: "Under Statuses, type new names and choose Save names. Each must be different; leave one blank to keep its usual name.", shot: "statuses" },
    ],
    options: [
      { name: "General", description: "Workspace name (team workspaces)." },
      { name: "Appearance", description: "An emoji icon on a colour; without one, the first letter is shown." },
      { name: "Defaults", description: "The view new projects open in." },
      { name: "Statuses", description: "Names for Todo, In progress, Done and Canceled." },
      { name: "Tags · Templates", description: "Rename, recolour or delete tags; manage saved templates." },
      { name: "Data", description: "Export, backups and import; see Export and backups and Import." },
      { name: "Space · Webhooks · Danger zone", description: "Link a Noirly space, manage webhooks, delete the workspace." },
    ],
    permissions: [
      { who: "Viewer, Member", can: "See the settings." },
      { who: "Admin", can: "Edit everything except deleting the workspace." },
      { who: "Owner", can: "Everything, including the Danger zone." },
    ],
    advanced: [
      "Personal workspaces can change their look and defaults too, but not their name.",
      "Each project can still override the default view with Make default next to the view buttons.",
    ],
    troubleshooting: [
      { problem: "Save names is disabled", solution: "Two statuses have the same name (case doesn't matter). Make them different." },
      { problem: "I don't see Space or Danger zone", solution: "They're for team workspaces, and Danger zone is for owners." },
    ],
    related: ["tags", "templates", "export-and-backups", "webhooks", "spaces"],
    sources: ["src/features/workspace/WorkspaceSettingsView.tsx", "src/features/workspace/WorkspaceCustomization.tsx", "src/features/workspace/workspace-look.tsx", "src/core/workspace-settings.ts", "app/api/workspaces/[workspaceId]/customization", "app/(app)/w/[workspaceId]/settings"],
    keywords: ["customise", "customize", "icon", "status names", "statuses", "default view"],
    video: { scenario: "workspace-settings" },
  },
  {
    id: "spaces",
    category: "workspaces",
    kind: "feature",
    title: "Noirly spaces",
    summary: "Link a team workspace to a Noirly space so its members are managed once, across Noirly apps.",
    location: "Workspace settings → Space",
    introduction:
      "A Noirly space is a group of people kept in Noirly Identity and shared by the Noirly apps. Link a team workspace to a space and its members come from the space: add someone to the space and they're in the workspace too.",
    problem: "A team that uses several Noirly apps would otherwise invite and remove the same people in each one.",
    solution:
      "Flow can link a team to an existing space, or create a space from the team's current members. While linked, the Members page shows that members come from the space and hides invites; Identity notifies Flow of changes, and unlinking keeps everyone who's there.",
    highlights: ["Manage people once across Noirly apps", "Create a space from a team", "Sync now on demand", "Unlinking keeps current members"],
    useCases: [
      { title: "Trip planning across apps", body: "Link a “Goa Trip” space so the same group shares tasks in Flow and money in Ledger." },
    ],
    steps: [
      { title: "Open the Space section", body: "Main sidebar → Workspace → Space." },
      { title: "Link or create", body: "Choose a space under Space to link and confirm, or choose Create a space from this team." },
      { title: "Manage members in the space", body: "Members now shows where people come from; use Manage members to open the space." },
      { title: "Unlink", body: "Choose Unlink. Current members stay and you manage them in Flow again." },
    ],
    options: [
      { name: "Space to link", description: "Links to one of your spaces. Anyone here who isn't in the space loses access." },
      { name: "Create a space from this team", description: "Makes a new space with everyone in the team, and links it." },
      { name: "Sync now", description: "Pulls the space's current members." },
      { name: "Unlink", description: "Stops following the space; members stay." },
    ],
    permissions: [
      { who: "Admin, Owner", can: "Link, create, sync and unlink." },
      { who: "Personal workspaces", can: "Can't be linked." },
    ],
    advanced: [
      "Space change notices from Identity are signed and checked; unsigned notices are refused.",
      "If the space is deleted, the team is unlinked automatically and keeps its members.",
    ],
    troubleshooting: [
      { problem: "The Space section says it can't load", solution: "Flow couldn't reach Noirly Identity. Try again later; the team keeps working." },
    ],
    related: ["members-and-roles", "invites", "workspace-settings"],
    sources: ["src/features/workspace/SpaceLinkSection.tsx", "src/server/spaces", "app/api/workspaces/[workspaceId]/space", "app/api/identity/space-changed"],
    keywords: ["space", "identity", "shared members", "group"],
    video: { unavailable: "Spaces live in Noirly Identity, which the isolated test environment doesn't run, so linking a space can't be recorded without a live account." },
  },
];
