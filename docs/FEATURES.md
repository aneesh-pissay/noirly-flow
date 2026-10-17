# Noirly Flow — Web Features

**Product:** Noirly Flow (web only)  
**Audience:** Product, engineering, and onboarding  
**Status:** Inventory of features implemented in the current web app  
**Companion:** [ARCHITECTURE.md](./ARCHITECTURE.md) (target design); this doc reflects **what ships today**

This document covers the **Next.js web app** in `noirly-flow` only. Native / React Native (`NoirlyFlow`) is out of scope.

---

## 1. Snapshot

Noirly Flow is a dark-mode task and project manager for individuals and teams. Auth is **Noirly Identity** (OIDC). Data lives in **MongoDB** (Flow DB). Live board updates go through **noirly-realtime** when configured.

| Area | Status |
| --- | --- |
| Auth (Identity OIDC + Google One Tap via Identity) | Done |
| Personal + team workspaces | Done |
| Projects, Inbox, list / board / calendar | Done |
| Tasks (CRUD, filters, DnD, checklist, subtasks, recurrence) | Done |
| Assignees, tags, comments, activity + CSV | Done |
| RBAC (viewer → owner) | Done |
| Invite links | Done |
| Cmd+K command palette + search API | Done |
| Profile settings | Done |
| Realtime board sync + presence | Done (when WS URL set) |

---

## 2. Authentication & identity

| Feature | Details |
| --- | --- |
| Noirly Identity OIDC | Auth.js (NextAuth v5); scopes `openid profile email offline_access` |
| Login UI | “Noirly Login” opens popup OIDC (`/login/popup` → `/login/popup-complete`) |
| Google | One Tap / GSI on Flow; Google IdP lives on **Identity**, not as a Flow provider |
| Session gate | Unauthenticated users → `/login`; API accepts cookie session or Identity Bearer |
| First-login bootstrap | Upserts Flow user; creates **Personal** workspace + default project **Inbox board** (Todo / In progress / Done) |
| Sign out | Shell footer + dedicated action |
| Landing redirect | Signed-in `/` → personal workspace |

**Routes:** `/login`, `/login/popup`, `/login/popup-complete`

---

## 3. App shell & navigation

| Feature | Details |
| --- | --- |
| App shell | Sidebar: workspaces, Inbox, Board, Settings, Activity, Members; mobile drawer |
| Workspace switcher | List + create team; last workspace remembered in `sessionStorage` |
| Project nav | Per-workspace: Inbox + project list + New project |
| Optimistic navigation | Pending href + optimistic path for snappy sidebar clicks |
| Saving indicator | Global UI when mutations are in flight |
| Marketing landing | Public `/` with product tiles when signed out |

**Primary routes**

| Route | Purpose |
| --- | --- |
| `/` | Marketing or redirect into personal workspace |
| `/inbox` | Redirect to personal workspace inbox |
| `/settings` | Flow profile + Identity account link |
| `/invite/[token]` | Accept invite (login with `?next=` if needed) |
| `/w/[workspaceId]/t/[taskId]` | A task's lasting link: opens it in its project or the Inbox, wherever it is now (404 otherwise). The drawer's "Copy link" copies it; task emails and the calendar feed use it |
| `/w/[workspaceId]` | Redirect to first project (or empty state) |
| `/w/[workspaceId]/today` | Overdue and due-today open tasks across all projects and the Inbox; tick to complete |
| `/w/[workspaceId]/upcoming` | Open tasks due in the next 14 days, grouped by day |
| `/w/[workspaceId]/timeline` | Day or week (Mon–Sun) hour grid across all projects and the Inbox: timed tasks as blocks from their due time for their duration (30 min if unset), overlapping ones side by side; all-day tasks in a strip on top; done ones struck through; a line at the current time; prev / Today / next. Opens scrolled to 7:00. Time blocking: drag a block to another time or day, drag its bottom edge to change its duration, or drag a task from the "To schedule" panel (open tasks without a time) onto the grid; snaps to 15 minutes, works with mouse, pen and touch, and shows the result live before saving |
| `/w/[workspaceId]/filters` | Your saved filters, and a form for a new one |
| `/w/[workspaceId]/filters/[filterId]` | A saved filter's open matching tasks; edit or delete it |
| `/w/[workspaceId]/inbox` | Unfiled tasks |
| `/w/[workspaceId]/p/[projectId]` | Project tasks (list / board / calendar toggles) |
| `/w/[workspaceId]/members` | Members + invite links |
| `/w/[workspaceId]/activity` | Workspace activity + CSV export |

---

## 4. Workspaces

| Feature | Details |
| --- | --- |
| Kinds | `personal` \| `team` |
| Personal workspace | Created automatically on first login (`Personal`) |
| Create team | Sidebar form; creator is **owner**; seeds project **General** + three columns |
| List / open | `GET/POST /api/workspaces`, `GET /api/workspaces/[workspaceId]` (role + projects) |
| Switcher | Sidebar + command palette |

**Not in product yet:** rename / delete / leave workspace; dedicated workspace settings page.

---

## 5. Projects

| Feature | Details |
| --- | --- |
| Create project | Name in UI; default columns Todo / In progress / Done |
| List projects | Workspace detail + Project nav |
| Open project | `/w/.../p/[projectId]`; workspace root jumps to the first unarchived project |
| Rename, colour, archive, delete | Pencil on a sidebar project: rename, 8 colours (a dot before its name) or none, Archive, Delete. Archived projects leave the sidebar (listed under "Archived (n)" with Unarchive) and their tasks leave Today, Upcoming, filters and the calendar feed; the project page still opens, with a banner to unarchive. Activity: `project.archived` / `project.unarchived` |
| Favourites | Star a project to list it under Favourites at the top of the sidebar; personal (`GET/PUT /api/me/favorite-projects`) |
| Templates | Shared by the workspace. Save a task (with its open subtasks) from the drawer, or a project (its sections, open tasks and subtasks) from the sidebar edit menu. New task → "From template" starts from it (the form's fields win; subtasks are added); New project → "From …" makes the project with its sections and tasks. Managed in Workspace settings → Templates. Up to 200 tasks per template, 100 templates per workspace. `GET/POST /api/workspaces/[workspaceId]/templates`, `DELETE /api/templates/[templateId]`, `POST /api/templates/[templateId]/apply` |
| Move tasks | Drawer can move a task between Inbox and a project (its section is cleared) |
| Sections | Named groups in a project's list view, separate from board columns: "+ Add section" under the list, Rename / Delete on each header (deleting keeps the tasks, under No section). Pick a task's section in the drawer or new-task dialog. `GET/POST /api/projects/[projectId]/sections`, `PATCH/DELETE /api/sections/[sectionId]` (member and up) |

**Not in product yet:** description / `defaultView` UI, separate `/board` `/list` `/calendar` URLs (views are in-page toggles).

---

## 6. Tasks

### 6.1 Core

| Feature | Details |
| --- | --- |
| CRUD | Create / update / soft-delete with optimistic cache updates |
| Inbox | Unfiled tasks (`projectId: null`) |
| Quick add | New-task dialog (also opened from Cmd+K with the query as title). Natural-language title: `Pay rent every 1st 9am p1 #Home` sets due date and time, repeat, priority (`p1`–`p4`) and project (`#name`, `#inbox`); also `today`, `tomorrow`, `next week`, `in 3 days`, weekday names, `aug 14`, `every mon and thu`, `every weekday`, `every 2 weeks after completion`. A live preview shows what was recognised; "Keep as typed" turns it off. `@name` adds a tag (made if new, marked "(new)" in the preview) |
| Status | `todo` \| `in_progress` \| `done` \| `canceled` |
| Priority | `none` \| `low` \| `medium` \| `high` \| `urgent` |
| Due date | Date with an optional time (`dueHasTime`); overdue / today badges — a timed task is overdue once its time passes, an all-day one the next day |
| Start date | Optional all-day `startAt` in the drawer and new-task dialog, never after the due date; list and board show "Starts …" until it arrives; a recurring task's next copy keeps the same gap before its due date |
| Deadline | Optional all-day `deadlineAt`, separate from the planned due date; list and board show "Deadline …", marked once it has passed; a recurring task's next copy keeps the same gap from its due date. Not yet shown in the calendar view or `.ics` feed |
| Duration | Optional estimate (`durationMinutes`, presets 15m–8h) in the drawer and new-task dialog; shown in list and board; a timed task's `.ics` event lasts this long (30 minutes when unset); recurring copies keep it |
| Reminders | For a task with a due time: at the time, 5/10/15/30 min, 1–2 h or 1 day before (`reminderMinutes`). When due, assignees (or the creator, if nobody is assigned) get a bell notification and an email. Sent by a sweep that runs after the bell's once-a-minute poll, and by `GET /api/cron/due-reminders` (CRON_SECRET) for an external scheduler; reminders more than 6 h late are dropped. Changing the due time or lead time re-arms it |
| Soft delete + Trash | `deletedAt`; **Undo** right after deleting, and `/w/[workspaceId]/trash` lists deleted tasks with **Restore** (back to its project and column, or the Inbox if the project is gone) |

### 6.2 Views

| View | Details |
| --- | --- |
| **List** | Inline status / priority / due / delete; tag + assignee chips; grouped by section when the project has sections (No section first); "Select" for bulk edit: tick rows (or click them), then set status / priority / due date, clear due, assign to someone (or nobody), move to a project or the Inbox, or delete, for all at once (`POST /api/workspaces/[workspaceId]/tasks/bulk`, up to 100, each task through the normal update so recurrence, emails and activity still happen; failures listed per task) |
| **Board (Kanban)** | `@dnd-kit` (pointer + keyboard); cross-column maps status via `statusMapped`; optimistic reorder; canceled tasks hidden |
| **Gantt** | Project view: a bar per dated task from its start to its due date (one day if it has only one), deadline marks, "blocked by" arrows, weekends shaded, a line for today, undated tasks listed below. Drag a bar to shift both dates (keeping a due time) or an end to change that date; whole days; never past the other end |
| **Calendar** | Month grid by `dueAt`, all-day tasks first then timed ones by time (time shown on the chip); undated list; prev / next month |

### 6.3 Task drawer (`?task=`)

Title, description, status, priority, project, due date, recurrence, assignees, tags, checklist, subtasks, comments, per-task activity. Escape closes.

### 6.4 Rich fields

| Feature | Details |
| --- | --- |
| Checklist | Add / toggle / remove (persisted on task) |
| Subtasks | Drawer "Subtasks": add, tick, and open a subtask in the drawer (with its own subtasks and a breadcrumb back up); four levels in all, no loops. List, board, Today/Upcoming and filter rows show done/total. Subtasks move with their parent's project, are deleted with it and come back with it from the Trash (the Trash lists the parent only) |
| Assignees | Multi-select workspace members |
| Tags | Drawer and new-task dialog: toggle the workspace's tags or add a new one; coloured `@tag` chips on list, board, Today/Upcoming and filter rows; "Any tag" filter in the list view; Workspace settings → Tags to rename, recolour (8 colours) or delete (taken off every task) |
| Recurrence | "Repeat" in the drawer and new-task dialog: daily, every weekday, weekly, monthly, yearly, or custom — every N days / weeks / months / years, chosen weekdays, counted from the due date or from completion. Days are counted in the browser's time zone saved on the rule; monthly on the 31st uses the last day of short months. Completing spawns the next occurrence; list and board show a repeat icon |
| Dependencies | Drawer "Blocked by": search for open tasks this one waits on (up to 20, same workspace, no loops); "Blocking" lists the tasks waiting on it. While a blocker is open the task is blocked: a "Blocked" badge on rows, and finishing it is refused everywhere (drawer, list, board drag, bulk edit, API: 409). `blocked` term in saved filters. `blockedByIds` on tasks; `GET /api/tasks/[taskId]/blocking` |
| Filters | Search, assigned to me, status, priority, due (overdue / today / upcoming / none); due ranges are the browser's local days, sent as `dueAfter` / `dueBefore` |

**Partial / not yet:** checklist title edit, end date / count for repeats.

---

## 7. Collaboration

| Feature | Details |
| --- | --- |
| Comments | List + create on a task (optimistic) |
| Activity verbs | `task.created`, `task.updated`, `task.assigned`, `task.deleted`, `comment.created` |
| Task activity | Inside the drawer |
| Workspace activity | Infinite “Load more” on `/w/.../activity` |
| CSV export | Whole workspace log built server-side in one request (`GET /api/workspaces/[workspaceId]/activity/export`) |
| Edit / delete comments | Authors edit their own (shown as *edited*; newly tagged people are notified); authors, admins and owners delete |
| In-app notifications | Header bell: mentions, assignments, comments on tasks you created or are assigned to, and due-time reminders; unread count, mark read / mark all read; polls every 60s |

**Not in product yet:** comment threads / reactions; notification preferences.

---

## 8. Access control (RBAC)

Roles: **viewer** &lt; **member** &lt; **admin** &lt; **owner**

| Capability | Minimum role |
| --- | --- |
| `workspace.view` | viewer+ |
| `task.write` / `project.write` | member+ |
| `members.manage` | admin+ |

Enforced on API (`requireMembership` / `requireWorkspaceRole`) and reflected in UI (viewers are read-only for writes). Guards: cannot demote last owner; cannot change own role; only owner can assign owner.

---

## 9. Members & invites

| Feature | Details |
| --- | --- |
| Members table | Name, email, role |
| Capacity | `/w/[workspaceId]/capacity` (sidebar, Cmd+K): a week of people × days, each cell the open work due that day (task durations, a shared task counting for each assignee) against the person's hours, with a bar; over-capacity days in red with "Over …"; tasks without a duration counted as "+N unestimated"; click a cell for its tasks. Hours per weekday per member (default 8h Mon–Fri): set your own, or anyone's as an admin (`PUT /api/workspaces/[workspaceId]/members/[userId]/capacity`). The drawer warns under Assignees when the task's due day puts someone over |
| Role change / remove | Admin+; cannot remove self |
| Invite link | One-time token, 7-day expiry, hashed; roles admin / member / viewer; copy `/invite/[token]` |
| Accept invite | Logged-in accept; unauthenticated users sent through login with return URL |

**Not in product yet:** email invites, list / revoke pending invites, invite-by-email address.

---

## 9a. Saved filters

| Feature | Details |
| --- | --- |
| Personal filters | Name + query, per user per workspace (any role, viewers included; up to 50). Listed in the sidebar under Filters and in Cmd+K |
| Query language | `today`, `tomorrow`, `overdue`, `no date`, `next 7 days` / `7 days`, `p1`–`p4`, `no priority`, `#Project`, `#Inbox`, `@tag`, `assigned to: me` / `others` / `<name>`, `no assignee`, `recurring`, `blocked`, `deadline` / `no deadline`, `search: text`; join with `&`, `|`, `!` and `( )` (`&` binds tighter) |
| Evaluation | In the browser over the workspace's open tasks, so days are the viewer's days; the query is checked as you type and can't be saved while it doesn't parse |
| API | `GET/POST /api/workspaces/[workspaceId]/filters`, `PATCH/DELETE /api/filters/[filterId]` (owner only; anyone else gets 404) |

## 10. Search & keyboard

| Feature | Details |
| --- | --- |
| Command palette | **Cmd/Ctrl+K** (`cmdk`) |
| Palette actions | Create task / project from query (if permitted); jump Inbox / Activity / workspaces / Settings |
| Search API | Debounced (≥2 chars) → `GET /api/search?q=` (tasks + workspace names, membership-scoped) |
| Open hits | Project or inbox with `?task=` |
| Shortcuts | `/` focuses in-page task search; `C` opens palette; `1` list, `2` board, `3` calendar, `4` Gantt (on project) |

**Not in product yet:** dedicated `/search` page; architecture shortcuts **N** (new project) and **Cmd+Enter** (save drawer).

---

## 11. Settings

| Feature | Details |
| --- | --- |
| `/settings` | Identity name / email + link to Identity `/account` |
| Flow profile | Display name, title, timezone (fixed list), bio via `GET/PATCH /api/me` |
| Display name usage | Members, comments, boards |
| Calendar feed | Private `.ics` subscription link (`/api/calendar/<token>.ics`) for Google / Apple / Outlook: tasks with a due date assigned to you, plus unassigned ones you created; all-day events in your profile timezone, or a timed event for a task with a due time, lasting its duration (30 minutes when unset); create, replace or turn off in Settings (only a hash of the token is stored) |

**Not in product yet:** two-way Google Calendar sync; separate profile / preferences routes; theme / density / default-view preferences.

---

## 12. Realtime

Requires `NEXT_PUBLIC_REALTIME_WS_URL` (and matching server JWT config).

| Feature | Details |
| --- | --- |
| Client | `@noirly-dev/realtime-client` via `FlowRealtimeProvider` |
| Token | `GET /api/realtime/token` — workspace subscribe; project subscribe + presence |
| Project channel | LWW `task.upsert`, `tasks.reordered`, `task.delete`, `comment.created` |
| Server publish | On create / update / delete / reorder / comment |
| Presence | Avatars (up to 5 + `+N`) and live / idle indicator |
| Fallback polling | ~30s if socket not ready, ~60s if ready |

**Not in product yet:** `presence.taskFocus` highlight; realtime on Inbox (project boards only); client publish capability.

---

## 13. HTTP API (implemented)

| Method | Path |
| --- | --- |
| Auth.js | `/api/auth/[...nextauth]` |
| GET, PATCH | `/api/me` |
| GET, POST | `/api/workspaces` |
| GET | `/api/workspaces/[workspaceId]` |
| GET, POST | `/api/workspaces/[workspaceId]/projects` |
| GET, POST | `/api/workspaces/[workspaceId]/tasks` |
| GET, POST | `/api/workspaces/[workspaceId]/tags` |
| GET | `/api/workspaces/[workspaceId]/members` |
| PATCH, DELETE | `/api/workspaces/[workspaceId]/members/[userId]` |
| POST | `/api/workspaces/[workspaceId]/invites` |
| GET | `/api/workspaces/[workspaceId]/activity` |
| GET | `/api/workspaces/[workspaceId]/activity/export` (CSV) |
| GET | `/api/projects/[projectId]` |
| POST | `/api/projects/[projectId]/reorder` |
| GET, PATCH, DELETE | `/api/tasks/[taskId]` |
| GET, POST | `/api/tasks/[taskId]/comments` |
| GET | `/api/search` |
| GET | `/api/realtime/token` |
| POST | `/api/invites/accept` |

---

## 14. Feature modules (code map)

| Module | Role |
| --- | --- |
| `src/features/auth/` | Identity popup login, Google One Tap, sign out |
| `src/features/workspace/` | Shell, project nav, team create, members/invites, RBAC context |
| `src/features/task/` | List / board / calendar, drawer, filters, DnD, due badges, assignees |
| `src/features/comments/` | Task comment thread |
| `src/features/activity/` | Task + workspace feeds, CSV |
| `src/features/command-palette/` | Cmd+K create / search / navigate |
| `src/features/realtime/` | Provider, project channel, presence |
| `src/features/settings/` | Flow profile + Identity link |
| `src/core/` | Enums, permissions, recurrence helpers, sync types, query keys |
| `src/server/` | Mongo sync provider, auth bootstrap, activity, search, realtime publish |

---

## 15. Explicitly not done (web)

Tracked here so architecture plans are not mistaken for shipped product:

- Dedicated `/search`, workspace settings, per-view board/list/calendar URLs
- Project / workspace / column admin (archive)
- Email invites, notifications, mentions, billing
- Repeat end date or count; `blocked` status
- Presence task-focus highlight; Inbox realtime
- Light theme toggle; offline CRDT; chat / video (architecture non-goals)

---

## 16. Related docs

| Doc | Purpose |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Target architecture, locked stack decisions, roadmap shape |
| [README.md](../README.md) | Repo overview + Identity local setup |
| `noirly-realtime/docs/ARCHITECTURE.md` | Realtime service design (separate repo) |
