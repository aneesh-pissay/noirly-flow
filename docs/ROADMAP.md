# Noirly Flow — Roadmap

**Status:** Living checklist of what to build next, in order
**Companions:** [FEATURES.md](./FEATURES.md) (what ships today) · [ARCHITECTURE.md](./ARCHITECTURE.md) (target design)

Each task is a checkbox. When a task ships, tick it and add the date:
`- [x] Due times on tasks — done 2026-11-02`

Phases are ordered by dependency: most later work (calendar, timeline, Gantt,
AI planning) needs the Phase 1 date model first. Effort: **S** = days,
**M** = 1–2 weeks, **L** = a month or more.

---

## Progress

| Phase | Done |
| --- | --- |
| 0. Recent fixes | 3 / 4 |
| 1. Date model | 6 / 6 |
| 2. Capture and organisation | 10 / 10 |
| 3. Planning and calendar | 2 / 7 |
| 4. Productivity | 0 / 6 |
| 5. Collaboration and automation | 0 / 8 |
| 6. AI | 0 / 9 |
| 7. Platform and data | 0 / 7 |

---

## Phase 0 — Recent fixes

- [x] Remove the custom cursor (`NoirlyExperience cursor={false}`) — done 2026-10-16
- [x] Sign-in popup goes straight to Identity and closes without loading the app (`/login/popup`, `/login/popup-complete` as route handlers) — done 2026-10-16
- [x] Sign-out is one server-action request instead of three — done 2026-10-16
- [ ] Deploy with functions in Mumbai (`vercel.json` `regions: ["bom1"]` is added; deploy, then confirm `x-vercel-id` shows `bom1::bom1`) and test a full sign-in and sign-out

## Phase 1 — Date model (foundation)

- [x] Due **time** on tasks, not just a date (M) — done 2026-10-16
- [x] Start date in the UI — `startAt` is already stored on the model (S) — done 2026-10-16
- [x] Separate **deadline** from the planned due date (S) — done 2026-10-16
- [x] Task **duration** / time estimate (S) — done 2026-10-16
- [x] Full recurrence: monthly, yearly, every N days/weeks, chosen weekdays, "N days after completion" — today only daily and weekly (M) — done 2026-10-16
- [x] Reminders with lead time ("30 min before"), in-app and email; today only email (M) — done 2026-10-16

## Phase 2 — Capture and organisation

- [x] Natural-language quick add: `Pay rent every 1st 9am p1 #Home @bills` (S) — done 2026-10-16
- [x] **Today** and **Upcoming** views across all projects in a workspace (M) — done 2026-10-16
- [x] Saved smart filters with a query syntax (`today & #Work & @urgent`) (M) — done 2026-10-17 (e2e `filters.spec.ts` not yet run)
- [x] Tag filter in the list view and a tag colour picker (S) — done 2026-10-17 (tags brought back in the UI; e2e `tags.spec.ts` not yet run)
- [x] Sections inside a project (list view), separate from board columns (M) — done 2026-10-17 (e2e `sections.spec.ts` not yet run)
- [x] Project archive, colours and favourites (S) — done 2026-10-17 (e2e `projects-organise.spec.ts` not yet run)
- [x] Nested subtasks (more than one level) and a subtask drawer (M) — done 2026-10-17 (subtasks brought back in the drawer; e2e in `drawer.spec.ts` not yet run)
- [x] Bulk edit: multi-select, then set status / priority / due / assignee / move / delete (M) — done 2026-10-17 (e2e `bulk.spec.ts` not yet run)
- [x] Project and task templates (M) — done 2026-10-17 (e2e `templates.spec.ts` not yet run)
- [x] Dedicated task page `/w/[workspaceId]/t/[taskId]` for sharing links (S) — done 2026-10-17 (e2e in `drawer.spec.ts` not yet run)

## Phase 3 — Planning and calendar

_Needs Phase 1._

- [x] Dependencies and a `blocked` status; blocked tasks cannot be completed first (M) — done 2026-10-17 (blocked is worked out from open blockers, not a stored status; e2e `dependencies.spec.ts` not yet run)
- [x] Day and week timeline views (M) — done 2026-10-17 (e2e `timeline.spec.ts` not yet run)
- [ ] Time blocking: drag tasks onto the timeline to schedule them (L)
- [ ] Gantt view (start date, duration, dependencies) (L)
- [ ] Two-way Google Calendar sync (L)
- [ ] Two-way Outlook calendar sync (L)
- [ ] Capacity and availability: hours per day per member, overload warnings (L)

## Phase 4 — Productivity

- [ ] Pomodoro / focus timer on a task (S)
- [ ] Time tracking: manual entries plus a running timer (M)
- [ ] Habits and streaks, built on recurring tasks (M)
- [ ] Personal stats: completed per day/week, on-time rate (M)
- [ ] Daily and weekly review screens (S)
- [ ] Goals and milestones that tasks roll up into (L)

## Phase 5 — Collaboration and automation

- [ ] Custom fields per project: text, number, select, date, person (L)
- [ ] Email invites, plus listing and revoking pending invites (S)
- [ ] Approval workflow: request, approve, reject on a task (M)
- [ ] Automations: "when X, if Y, then Z" rules per project (L)
- [ ] Public API with personal access tokens (M)
- [ ] Outgoing webhooks — build on a shared Noirly package so other apps reuse it (M)
- [ ] Forms and task intake: a public form that creates tasks in a project (M)
- [ ] Workspace customisation: default view, statuses, icon, settings page (M)

## Phase 6 — AI

_Build the Claude API layer once, as a shared Noirly package (prompts, rate limits, cost tracking); the features appear in Flow._

- [ ] Shared AI package (S)
- [ ] Break a task down into subtasks (S)
- [ ] Project and activity summaries (S)
- [ ] Natural-language assistant ("move everything due Friday to Monday") (M)
- [ ] Prioritisation suggestions (M)
- [ ] AI daily schedule — needs Phase 3 time blocking (L)
- [ ] Rescheduling after interruptions (L)
- [ ] Deadline risk prediction — needs completion history (L)
- [ ] Agents that run multi-step workflows — needs Phase 5 automations and API (L)

## Phase 7 — Platform and data

- [ ] Installable web app (PWA) with read-only offline (M)
- [ ] Full data export (JSON / CSV) and scheduled backups (M)
- [ ] Import from Todoist and CSV (M)
- [ ] Layout and density preferences (S)
- [ ] Desktop app (PWA install or Tauri wrapper) (M)
- [ ] Mobile app (`NoirlyFlow`) brought up to web parity (L)
- [ ] Home-screen widgets in the mobile app (M)

---

## Cross-app

- [ ] Move project chat to **Pulse**; replace Flow's project chat with a "Discuss in Pulse" link. Task comments stay in Flow.

## Not planned

| Item | Why |
| --- | --- |
| Two-way Apple Calendar sync | No proper public web API; the `.ics` feed already works in Apple Calendar |
| Full offline-first editing | Architecture non-goal (see ARCHITECTURE.md §1.3); Phase 7 adds read-only offline |
| Widgets in the web app | Only possible in the native mobile app (Phase 7) |
