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
| `/w/[workspaceId]` | Redirect to first project (or empty state) |
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
| Open project | `/w/.../p/[projectId]`; workspace root jumps to first project |
| Move tasks | Drawer can move a task between Inbox and a project |

**Not in product yet:** rename, archive, delete, description/color/`defaultView` UI, custom column CRUD, separate `/board` `/list` `/calendar` URLs (views are in-page toggles).

---

## 6. Tasks

### 6.1 Core

| Feature | Details |
| --- | --- |
| CRUD | Create / update / soft-delete with optimistic cache updates |
| Inbox | Unfiled tasks (`projectId: null`) |
| Quick add | Title + priority + due date |
| Status | `todo` \| `in_progress` \| `done` \| `canceled` |
| Priority | `none` \| `low` \| `medium` \| `high` \| `urgent` |
| Due date | Stored + overdue / today badges |
| Soft delete | `deletedAt` (no restore UI) |

### 6.2 Views

| View | Details |
| --- | --- |
| **List** | Inline status / priority / due / delete; tag + assignee chips |
| **Board (Kanban)** | `@dnd-kit` (pointer + keyboard); cross-column maps status via `statusMapped`; optimistic reorder; canceled tasks hidden |
| **Calendar** | Month grid by `dueAt`; undated list; prev / next month |

### 6.3 Task drawer (`?task=`)

Title, description, status, priority, project, due date, recurrence, assignees, tags, checklist, subtasks, comments, per-task activity. Escape closes.

### 6.4 Rich fields

| Feature | Details |
| --- | --- |
| Checklist | Add / toggle / remove (persisted on task) |
| Subtasks | `parentTaskId`; create + mark done (one level in list) |
| Assignees | Multi-select workspace members |
| Tags | Workspace tags; create + attach (default color; no color picker UI) |
| Recurrence | Daily / weekly (interval 1 in UI); completing spawns next occurrence |
| Filters | Search, assigned to me, status, priority, due (overdue / today / upcoming / none) |

**Partial / not yet:** `startAt` UI, tag filter in list UI, checklist title edit, nested subtask drawer, custom RRULE / monthly / yearly, dedicated `/tasks/[taskId]` page.

---

## 7. Collaboration

| Feature | Details |
| --- | --- |
| Comments | List + create on a task (optimistic) |
| Activity verbs | `task.created`, `task.updated`, `task.assigned`, `task.deleted`, `comment.created` |
| Task activity | Inside the drawer |
| Workspace activity | Infinite “Load more” on `/w/.../activity` |
| CSV export | Whole workspace log built server-side in one request (`GET /api/workspaces/[workspaceId]/activity/export`) |

**Not in product yet:** edit / delete comments, mentions, notifications, email.

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
| Role change / remove | Admin+; cannot remove self |
| Invite link | One-time token, 7-day expiry, hashed; roles admin / member / viewer; copy `/invite/[token]` |
| Accept invite | Logged-in accept; unauthenticated users sent through login with return URL |

**Not in product yet:** email invites, list / revoke pending invites, invite-by-email address.

---

## 10. Search & keyboard

| Feature | Details |
| --- | --- |
| Command palette | **Cmd/Ctrl+K** (`cmdk`) |
| Palette actions | Create task / project from query (if permitted); jump Inbox / Activity / workspaces / Settings |
| Search API | Debounced (≥2 chars) → `GET /api/search?q=` (tasks + workspace names, membership-scoped) |
| Open hits | Project or inbox with `?task=` |
| Shortcuts | `/` focuses in-page task search; `C` opens palette; `1` list, `2` board, `3` calendar (on project) |

**Not in product yet:** dedicated `/search` page; architecture shortcuts **N** (new project) and **Cmd+Enter** (save drawer).

---

## 11. Settings

| Feature | Details |
| --- | --- |
| `/settings` | Identity name / email + link to Identity `/account` |
| Flow profile | Display name, title, timezone (fixed list), bio via `GET/PATCH /api/me` |
| Display name usage | Members, comments, boards |

**Not in product yet:** separate profile / preferences routes; theme / density / default-view preferences; calendar still uses browser local time for filters.

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

- Dedicated `/search`, workspace settings, per-view board/list/calendar URLs, task deep-link page
- Project / workspace / column admin (rename, archive, delete, custom columns, tag color picker)
- Email invites, notifications, mentions, billing
- Comment edit/delete, soft-delete restore
- Full RRULE; `blocked` status; `startAt` UI
- Presence task-focus highlight; Inbox realtime
- Light theme toggle; offline CRDT; chat / video (architecture non-goals)

---

## 16. Related docs

| Doc | Purpose |
| --- | --- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Target architecture, locked stack decisions, roadmap shape |
| [README.md](../README.md) | Repo overview + Identity local setup |
| `noirly-realtime/docs/ARCHITECTURE.md` | Realtime service design (separate repo) |
