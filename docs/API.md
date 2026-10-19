# Flow API

The same JSON API the web app uses, callable from scripts with a personal access token.

## Authentication

Make a token in **Settings → API tokens**. It's shown once. Send it as a bearer token (`$FLOW_URL` is the address you open Flow at):

```bash
curl -H "Authorization: Bearer nfp_w_…" $FLOW_URL/api/workspaces
```

- **Read only** tokens (`nfp_r_…`) can only make `GET` requests. Anything else gets `403 read_only_token`.
- **Read and write** tokens (`nfp_w_…`) can do what you can do in the app, in every workspace you're in, with your role there.
- Tokens expire after 30, 90 or 365 days, or never, as chosen when they're made. Revoke them in Settings at any time.
- A token can't manage tokens, delete your account, change your calendar link, or link a workspace to a Space. Those need you signed in.
- Bearer requests don't need the `X-Noirly-CSRF` header that browser requests send.

## Conventions

- JSON in and out. IDs are 24-character hex strings.
- Dates are ISO 8601 instants. An all-day date (`dueHasTime: false`) is stored at noon in the user's time zone.
- Errors: `{ "error": "<code>", "message": "<readable>" }` with a matching status: `400 invalid_request`, `401 unauthorized`, `403 forbidden`, `404 not_found`, `409 conflict` (also `blocked`, `needs_approval`), `429 rate_limited` (with `Retry-After`).
- Rate limit: per account and per IP, 300 requests a minute by default.

## Tasks

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/workspaces/{workspaceId}/tasks` | Query: `projectId`, `inbox=1`, `root=1`, `parentTaskId`, `assigneeId`, `status` (comma list: `todo,in_progress,done,canceled`), `priority`, `search`, `dueAfter`, `dueBefore`, `due`, `tag`, `completedAfter`, `goal` |
| POST | `/api/workspaces/{workspaceId}/tasks` | Body: `title` (required), `description`, `projectId` (null = Inbox), `status`, `priority` (`none,low,medium,high,urgent`), `dueAt`, `dueHasTime`, `startAt`, `deadlineAt`, `durationMinutes`, `reminderMinutes`, `recurrence`, `assigneeIds`, `tagIds`, `sectionId`, `goalId`, `milestoneId`, `parentTaskId`, `blockedByIds` |
| GET | `/api/tasks/{taskId}` | |
| PATCH | `/api/tasks/{taskId}` | Any create field, plus `fieldValues` (custom field id → value; `null` clears) and `habit` |
| DELETE | `/api/tasks/{taskId}` | Moves to Trash; `POST /api/tasks/{taskId}/restore` brings it back |
| POST | `/api/workspaces/{workspaceId}/tasks/bulk` | Up to 100 tasks: `{ taskIds, patch }` (patch: `status`, `priority`, `dueAt`, `dueHasTime`, `projectId`, `assigneeIds`) or `{ taskIds, delete: true }`; per-task failures come back in `failed` |
| GET, POST | `/api/tasks/{taskId}/comments` | Body: `{ body, mentions? }` |
| GET, POST | `/api/tasks/{taskId}/time` | Log time: `{ minutes, note? }`; `POST …/time/start` starts a timer, `POST /api/me/time/stop` stops it |
| POST, DELETE | `/api/tasks/{taskId}/approval` | Request approval `{ approverId }`, or withdraw it |
| POST | `/api/tasks/{taskId}/approval/decision` | `{ decision: "approve" \| "reject", note? }`, approver only |

Project automations run after creates and updates made through the API, as the token's owner.

## Workspaces and projects

| Method | Path |
| --- | --- |
| GET, POST | `/api/workspaces` |
| GET, PATCH, DELETE | `/api/workspaces/{workspaceId}` |
| GET | `/api/workspaces/{workspaceId}/members` |
| GET, POST | `/api/workspaces/{workspaceId}/projects` |
| GET, PATCH, DELETE | `/api/projects/{projectId}` |
| GET, POST | `/api/projects/{projectId}/sections` · PATCH, DELETE `/api/sections/{sectionId}` |
| GET, POST | `/api/projects/{projectId}/fields` · PATCH, DELETE `/api/fields/{fieldId}` |
| GET, POST | `/api/projects/{projectId}/automations` · PATCH, DELETE `/api/automations/{ruleId}` |
| GET, POST | `/api/workspaces/{workspaceId}/tags` · PATCH, DELETE `/api/tags/{tagId}` |
| GET, POST | `/api/workspaces/{workspaceId}/goals` · GET, PATCH, DELETE `/api/goals/{goalId}` |
| POST | `/api/goals/{goalId}/milestones` · PATCH, DELETE `/api/goals/{goalId}/milestones/{milestoneId}` |
| GET, POST | `/api/workspaces/{workspaceId}/filters` · PATCH, DELETE `/api/filters/{filterId}` |
| GET, POST | `/api/workspaces/{workspaceId}/templates` · POST `/api/templates/{templateId}/apply` |

## You

| Method | Path |
| --- | --- |
| GET, PATCH | `/api/me` |
| GET | `/api/notifications` · POST `/api/notifications/read` |
| GET | `/api/workspaces/{workspaceId}/stats?since=` |
| GET | `/api/workspaces/{workspaceId}/activity` (and `/activity/export` as CSV) |
| GET | `/api/search?q=` |

## Example: add a task to the Inbox

```bash
curl -X POST $FLOW_URL/api/workspaces/$WORKSPACE/tasks \
  -H "Authorization: Bearer $FLOW_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Renew domain","priority":"high","dueAt":"2026-11-01T06:30:00.000Z","dueHasTime":false}'
```
