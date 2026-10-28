import type { DocArticle } from "@/src/docs/types";

export const gettingStarted: DocArticle[] = [
  {
    id: "overview",
    category: "getting-started",
    kind: "guide",
    title: "Application overview",
    summary: "What Noirly Flow is, who it's for, and how its pieces fit together.",
    location: "Everywhere",
    introduction:
      "Noirly Flow is a task and project manager for individuals and teams. Everything lives in a workspace: your private Personal workspace, plus any team workspaces you create or join. A workspace holds projects, a project holds tasks, and every task can be seen as a list, a board, a calendar, a Gantt chart or a block on your timeline.\n\nYou sign in once with your Noirly account (Noirly Identity), and the same account works across the Noirly apps.",
    problem:
      "People and small teams usually juggle several tools: a to-do app for themselves, a board for the team, a calendar for deadlines and a spreadsheet for reporting. Work gets copied between them, and nobody is sure which copy is current.",
    solution:
      "Flow keeps personal and team work in one product with one account. The mode comes from the workspace you're in, not a separate app: the same task drawer, quick add, views and search work whether you're planning your week alone or running a project with a team. Team changes show up for everyone, permissions keep viewers read-only, and integrations (calendars, webhooks, an API) let Flow sit at the centre of the tools you already use.",
    highlights: [
      "Personal and team workspaces with role-based access",
      "Projects with list, board, calendar and Gantt views",
      "A task drawer for editing without leaving the page",
      "Quick add that understands dates, repeats and priorities",
      "Today, Upcoming, Timeline, Goals, Habits and Review for planning",
      "Calendars, webhooks, API tokens, import and export",
    ],
    useCases: [
      { title: "Personal planning", body: "Capture errands and recurring chores in your Personal workspace, then work from Today and your timeline." },
      { title: "Running a team project", body: "Create a team workspace, invite colleagues, split work into sections and move cards across the board together." },
      { title: "Client intake", body: "Publish an intake form so clients file requests that land as tasks, with automations to triage them." },
    ],
    steps: [
      { title: "Find your workspaces", body: "The main sidebar lists your workspaces. Personal is created for you the first time you sign in.", shot: "shell" },
      { title: "Open a project", body: "The workspace sidebar lists Today, Upcoming, Timeline and the other planning pages, then the Inbox and your projects.", shot: "project" },
      { title: "Open a task", body: "Click any task to open the task drawer on the right; Escape closes it.", shot: "drawer" },
      { title: "Search or jump anywhere", body: "Press Ctrl K (⌘K on a Mac) for the command palette." },
    ],
    related: ["navigating-flow", "workspaces", "quick-add", "task-drawer"],
    sources: ["app/(app)/layout.tsx", "src/components/AppShell.tsx", "src/features/workspace/WorkspaceShell.tsx", "docs/FEATURES.md", "app/(marketing)/page.tsx"],
    keywords: ["intro", "introduction", "what is flow", "tour"],
    video: { scenario: "overview" },
  },
  {
    id: "setup",
    category: "getting-started",
    kind: "guide",
    title: "Installation & setup",
    summary: "What a Flow server needs, and which optional services switch on which features.",
    location: "Server environment (.env)",
    introduction:
      "If you use a hosted Flow, there's nothing to install: sign in and go. This page is for whoever runs the Flow server. Flow is a Next.js app backed by MongoDB, and it signs people in through Noirly Identity. A handful of optional services switch on extra features; when one isn't configured, the feature that needs it says so instead of failing silently.",
    steps: [
      { title: "Provide MongoDB", body: "Set `MONGODB_URI`. Flow uses its own database (for example `noirly-flow`) on the same host Identity uses." },
      { title: "Connect Noirly Identity", body: "Set `AUTH_NOIRLY_ISSUER`, `AUTH_NOIRLY_CLIENT_ID` and `AUTH_NOIRLY_CLIENT_SECRET` (the secret printed by Identity's seed), plus `AUTH_SECRET` and `AUTH_URL`." },
      { title: "Optional: live updates", body: "Point `NEXT_PUBLIC_REALTIME_WS_URL` and the `REALTIME_*` settings at a noirly-realtime server for live boards, chat and presence. Without it, Flow refreshes on a short poll." },
      { title: "Optional: email", body: "Set the `SMTP_*` settings and `EMAIL_FROM` for invites, mentions, assignment emails and reminders. In development, unset SMTP logs invite links to the console." },
      { title: "Optional: file storage", body: "Set the `R2_*` settings for attachments and backups (Cloudflare R2). In development, files go to a local folder instead." },
      { title: "Optional: calendars and schedulers", body: "Set `CALENDAR_TOKEN_KEY` and Google or Microsoft client credentials for two-way calendar sync, and `CRON_SECRET` so a scheduler can call the `/api/cron/*` routes (reminders, webhooks retries, backups, calendar sync)." },
    ],
    options: [
      { name: "MONGODB_URI", description: "Required. Flow's database." },
      { name: "AUTH_NOIRLY_*", description: "Required. The OIDC client Flow uses to sign people in with Noirly Identity." },
      { name: "NEXT_PUBLIC_REALTIME_WS_URL", description: "Optional. Live board updates, chat and presence avatars." },
      { name: "SMTP_* / EMAIL_FROM", description: "Optional in development, required in production for emailed invites and task emails." },
      { name: "R2_*", description: "Optional in development, required in production for attachments and backups." },
      { name: "GOOGLE_CALENDAR_* / MICROSOFT_CALENDAR_*", description: "Optional. Each calendar appears under Settings → Two-way calendar sync once its credentials and `CALENDAR_TOKEN_KEY` are set." },
      { name: "CRON_SECRET", description: "Optional. Lets an external scheduler run reminders, webhook retries, backups and calendar sync." },
    ],
    troubleshooting: [
      { problem: "Uploading a file says “Attachments aren't set up”", solution: "The server has no R2 credentials in production. Set the four `R2_*` variables and configure the bucket's CORS for PUT from your Flow origin." },
      { problem: "Invites by email never arrive", solution: "Check the `SMTP_*` settings. Invite links (Members → Generate link) work without email." },
      { problem: "Boards don't update live", solution: "Realtime is optional. Without `NEXT_PUBLIC_REALTIME_WS_URL`, boards refresh every 30–60 seconds instead." },
    ],
    related: ["overview", "signing-in", "calendar-sync", "attachments"],
    sources: [".env.example", "README.md", "src/server/storage", "src/server/mail", "src/features/realtime", "app/api/realtime"],
    keywords: ["install", "self-host", "environment", "configuration", "env"],
    video: { unavailable: "Setup happens in the server's environment, not in the app, so there's no workflow to record." },
  },
  {
    id: "signing-in",
    category: "getting-started",
    kind: "feature",
    title: "Signing in and out",
    summary: "One Noirly account for Flow and every other Noirly app, through a secure popup.",
    location: "/login",
    introduction:
      "Flow has no passwords of its own. You sign in with your Noirly account through Noirly Identity, which opens in a popup. The first time you sign in, Flow sets you up with a Personal workspace so you can start straight away. Sign out from the bottom of the main sidebar.",
    problem:
      "Every new app usually means another password to create, remember and protect, and another place where an account can be compromised.",
    solution:
      "Flow delegates sign-in to Noirly Identity using OpenID Connect. Identity handles registration, verification and Google sign-in; Flow only stores the stable account id it gets back. One account works across the Noirly suite, and signing out of Flow ends that session for real, even if an old tab tries to reuse it.",
    highlights: [
      "Sign in with Noirly Identity in a secure popup",
      "Google sign-in offered through Identity (One Tap)",
      "A Personal workspace created on first sign-in",
      "Sign out clears Flow's saved offline data on this device",
    ],
    useCases: [
      { title: "Joining from an invite", body: "Open an invite link while signed out: Flow sends you through sign-in and brings you back to the invite." },
      { title: "Shared computer", body: "Sign out when you're done; pages saved for offline reading are deleted too." },
    ],
    steps: [
      { title: "Open Flow", body: "Signed out, Flow's landing page has a sign-in button. Going to any page in the app takes you to /login.", shot: "login" },
      { title: "Choose Noirly Login", body: "Identity opens in a secure popup. Sign in there (or continue with Google)." },
      { title: "Land in your workspace", body: "Flow opens your Personal workspace. On your first visit it's created for you with an Inbox board (Todo, In progress, Done).", shot: "personal" },
      { title: "Sign out", body: "Use Sign out at the bottom of the main sidebar. You're returned to /login.", shot: "signout" },
    ],
    options: [
      { name: "Noirly Login", description: "Opens Noirly Identity in a popup and signs you in when it completes." },
      { name: "Google One Tap", description: "Appears when Identity offers Google; Google is an Identity sign-in, not a separate Flow account." },
      { name: "Sign out", description: "Ends the session, clears offline copies, and returns you to /login." },
    ],
    permissions: [
      { who: "Anyone", can: "Open the landing page, the privacy policy and public intake forms without signing in." },
      { who: "Signed-in users", can: "Everything else, within the roles they hold in each workspace." },
    ],
    advanced: [
      "API clients can authenticate with an Identity bearer token or a Flow API token instead of a browser session.",
      "A session that was signed out can't be revived by a late prefetch or an old cookie; it's refused with 401.",
    ],
    troubleshooting: [
      { problem: "The popup doesn't open", solution: "Allow popups for Flow's address in your browser, then choose Noirly Login again." },
      { problem: "I'm sent to /login from an invite link", solution: "That's expected when you're signed out; after signing in you return to the invite." },
    ],
    related: ["overview", "invites", "install-and-offline", "api-tokens"],
    sources: ["auth.ts", "app/(auth)", "src/features/auth", "proxy.ts", "src/server/auth", "app/api/auth"],
    keywords: ["login", "logout", "sign in", "sign out", "sso", "oidc", "identity", "google"],
    video: { scenario: "signing-in" },
  },
  {
    id: "navigating-flow",
    category: "getting-started",
    kind: "feature",
    title: "Finding your way around",
    summary: "The main sidebar, the workspace sidebar, and the header controls.",
    location: "App shell",
    introduction:
      "Flow has two sidebars. The main sidebar (left) holds Search, your workspaces, and links to Settings, Activity, Trash, Members, Workspace settings and these Docs. The workspace sidebar (next to it) holds everything inside the current workspace: Today, Upcoming, Timeline, Capacity, Habits, Stats, Review, Goals, the Inbox, your projects and saved filters. The header has a running-timer chip, the notification bell, the app switcher and theme controls.",
    problem:
      "Feature-rich tools often hide their best pages behind menus, so people only ever use the one screen they landed on.",
    solution:
      "Flow keeps every destination one click away and remembers where you were. The last workspace you opened is remembered, sidebar clicks respond instantly while the page loads, and on phones the main sidebar opens from the header menu while the workspace sidebar sits above the page.",
    highlights: [
      "Every workspace page one click away",
      "Instant sidebar feedback while pages load",
      "Remembers your last workspace",
      "Phone-friendly navigation",
    ],
    useCases: [
      { title: "Morning check-in", body: "Open Today, then glance at the bell for mentions and assignments." },
      { title: "Switching teams", body: "Click another workspace in the main sidebar; the workspace sidebar follows." },
    ],
    steps: [
      { title: "Pick a workspace", body: "Choose it in the main sidebar under Workspaces.", shot: "workspaces" },
      { title: "Use the workspace sidebar", body: "Today, Upcoming, Timeline, Capacity, Habits, Stats, Review and Goals are at the top, then the Inbox and projects.", shot: "workspace-nav" },
      { title: "Check the header", body: "The bell shows notifications; the palette and sun/moon buttons change colours and light or dark mode.", shot: "header" },
      { title: "Open the Docs", body: "Docs is at the bottom of the main sidebar's links, and in the command palette." },
    ],
    options: [
      { name: "Search", description: "Opens the command palette (also Ctrl K / ⌘K)." },
      { name: "New team workspace", description: "Creates a team workspace from the main sidebar." },
      { name: "Settings · Activity · Trash · Members · Workspace", description: "Your account settings and the current workspace's log, trash, people and settings." },
      { name: "Notifications bell", description: "Mentions, assignments, comments, reminders and approvals; see Notifications." },
      { name: "App switcher", description: "Jump to other Noirly apps." },
      { name: "Theme controls", description: "Pick a colour palette and switch light or dark mode." },
    ],
    permissions: [
      { who: "Everyone", can: "Sees the same navigation; pages hide controls their role can't use." },
    ],
    advanced: [
      "The workspace you last opened is remembered for this browser session, so /inbox and Docs links know where to send you.",
      "The main content scrolls inside its own pane, so the sidebars stay put on long pages.",
    ],
    troubleshooting: [
      { problem: "I can't see the sidebars on my phone", solution: "Open the menu button in the header for the main sidebar; the workspace sidebar sits at the top of the page on small screens." },
      { problem: "A workspace is missing", solution: "You only see workspaces you belong to. Ask an admin for an invite." },
    ],
    related: ["overview", "command-palette", "keyboard-shortcuts", "layout-and-themes"],
    sources: ["src/components/AppShell.tsx", "src/components/NavLink.tsx", "src/features/workspace/ProjectNav.tsx", "src/features/workspace/WorkspaceShell.tsx", "src/stores/ui-store.ts", "app/(app)/inbox", "app/(app)/w/[workspaceId]/inbox"],
    keywords: ["navigation", "sidebar", "menu", "header"],
    video: { scenario: "navigating-flow" },
  },
  {
    id: "keyboard-shortcuts",
    category: "getting-started",
    kind: "feature",
    title: "Keyboard shortcuts",
    summary: "Open the palette, search a list and switch views without the mouse.",
    location: "Anywhere in the app",
    introduction:
      "Flow is built to be driven from the keyboard. A few single keys cover the moves you make all day: open the command palette, focus the task search, and switch a project between list, board, calendar and Gantt.",
    problem: "Reaching for the mouse for every small move breaks concentration and slows down heavy users.",
    solution:
      "Shortcuts are deliberately few and memorable, and they never fire while you're typing in a field, so they can't eat your text. Drag-and-drop on the board works with the keyboard too.",
    highlights: ["Ctrl K / ⌘K or C for the palette", "/ to search the task list", "1–4 to switch views", "Escape closes drawers and dialogs"],
    useCases: [
      { title: "Triage at speed", body: "Press / to filter the list, then 2 to see the same tasks as a board." },
      { title: "Capture without clicking", body: "Press C, type a task with a date, and create it." },
    ],
    steps: [
      { title: "Open the command palette", body: "Press Ctrl K (⌘K on a Mac) or C anywhere outside a text field.", shot: "palette" },
      { title: "Search the current list", body: "On a project or the Inbox, press / to focus “Search tasks…”." },
      { title: "Switch views", body: "On a project: 1 list, 2 board, 3 calendar, 4 Gantt. The Inbox has list (1) and calendar (3).", shot: "views" },
      { title: "Close things", body: "Escape closes the task drawer, dialogs and menus." },
    ],
    options: [
      { name: "Ctrl K / ⌘K", description: "Command palette." },
      { name: "C", description: "Command palette (outside text fields)." },
      { name: "/", description: "Focus the task search on a project or the Inbox. In the Docs, focuses docs search." },
      { name: "1 · 2 · 3 · 4", description: "List, board, calendar, Gantt (board and Gantt on projects only)." },
      { name: "Escape", description: "Close the drawer, a dialog or a menu." },
      { name: "Enter / Shift+Enter in chat", description: "Send a message / add a new line." },
    ],
    permissions: [{ who: "Everyone", can: "All shortcuts; actions still respect your role." }],
    advanced: ["Shortcuts are ignored while a modifier (Ctrl, Alt, ⌘) is held or a field has focus, except Ctrl K / ⌘K.", "Board cards can be picked up and moved with the keyboard (dnd-kit keyboard sensor)."],
    troubleshooting: [
      { problem: "Pressing 2 does nothing", solution: "Board and Gantt exist only on projects; the Inbox has list and calendar." },
      { problem: "A shortcut typed a character instead", solution: "Click outside the text field first, or press Escape." },
    ],
    related: ["command-palette", "list-view", "board-view"],
    sources: ["src/features/task/TaskWorkspace.tsx", "src/features/command-palette/CommandPalette.tsx"],
    keywords: ["hotkeys", "keys", "keyboard"],
    video: { scenario: "keyboard-shortcuts" },
  },
];
