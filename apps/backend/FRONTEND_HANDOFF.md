# Backend → Frontend handoff (Role 2 → Role 3)

What the backend does, what each endpoint returns, how it behaves in the cases the screens care about, and how to switch the web app over from the mock.

**TL;DR:** every endpoint in `CONTRACT.md` works now, on the `scheduler` branch. Responses match `PlanView` / `ReplanProposal` in `schemas.ts`. Set `USE_MOCK = false` in `src/lib/api.ts`, run `npm run dev`, and open `/projects/p_mk301`. Everything in your `BACKEND_HANDOFF.md` "Assumptions" list holds; details are in "Your assumptions, answered" below.

---

## Running it

- `npm run dev` from the repo root starts the backend on **:4000** (and the frontend on :3000). Your `next.config.ts` proxy already points `/api/*` there.
- On start it logs `using fallbacks for: ...`, listing which Role 1 / Role 4 functions aren't merged yet (see "What isn't connected yet").
- Saved state lives in `apps/backend/data/projects.json` (gitignored). **To reset everything** (e.g. before a demo run), stop the backend, delete that file and start it again.

---

## The demo project is always there

`GET /api/projects/p_mk301` returns the MK301 demo plan, even on a fresh start. You don't need to create a project first.

- 5 members: Alex, Jo, Mia, Ravi, Sam. 6 criteria, 21 tasks, deadline **2026-11-06**. Starts as `state: "draft"`.
- `t1`, `t2` are `done` and `t3` is `doing`; the rest are `todo`.
- Built in on purpose, so every screen has something to show:
  - **Overload:** Mia, 14h planned vs 10.8h available (red load bar, plus a "Things to watch" item).
  - **Coverage gap:** "Critical evaluation of sources" (red banner).
  - **Low slack:** "Rehearse presentation" is due 2026-11-05, the day before the deadline.
  - **Replan Sam** from `2026-10-20` to `2026-10-24` gives exactly 3 changes (see "Replan").
  - **Reminders:** set "Today is" to `2026-10-20` and 5 notifications appear (one in progress and overdue, one overdue, one due today, two coming up).

---

## Endpoints

All paths are under `/api/projects`. Every response includes `warnings` (an empty array when there's nothing to say).

| Call | Returns | Notes |
| --- | --- | --- |
| `POST /` with `CreateProjectRequest` | **201** + PlanView (`state: "draft"`) | Runs brief reading and then the scheduler. No server timeout. |
| `GET /{id}` | PlanView | Always the latest saved state. |
| `PUT /{id}/plan` with `{ tasks }` | PlanView | Reruns analysis only, never the scheduler. Your tasks are saved exactly as sent. |
| `POST /{id}/confirm` | PlanView (`state: "confirmed"`) | Creates the Notion workspace. If Notion fails, it still confirms, with a warning. Safe to call twice. |
| `PATCH /{id}/tasks/{taskId}` with `{ status }` | PlanView | Copies the status to Notion if the project has a workspace. |
| `GET /{id}/notifications?today=YYYY-MM-DD` | `{ notifications, warnings }` | Uses your `today`. Without it, uses the server's date. |
| `POST /{id}/replan` with `{ change }` | ReplanProposal | Saves nothing to the plan. |
| `POST /{id}/replan/confirm` with `{ proposalId }` | PlanView | Applies the changes and copies them to Notion. |

### Errors

Always `{ "error": "...", "warnings": [] }`, with a short message you can show as-is.

| Status | When | Example `error` |
| --- | --- | --- |
| 400 | The request doesn't match the contract | `Invalid request. deadline: Invalid string: must match pattern ...` |
| 400 | Duplicate member names, or the deadline isn't after today | `The deadline (2026-10-01) has to be after today (2026-10-19).` |
| 404 | Unknown project, task, or proposal | `No project with id p_9.` / `No open proposal with id pr_1.` |
| 409 | Confirming a replan after the plan changed | `The plan changed after this proposal was made. Ask for a new replan.` |
| 502 | Brief reading (Role 1's LLM) failed | `Couldn't read the brief: ...` |
| 500 | Anything unexpected | `Something went wrong on the server.` |

Your front-end validation runs first, so most 400s shouldn't reach students.

---

## What each screen gets

### Start page: `POST /`

- Tasks come back with an owner, `start` and `due` set. Nothing starts before today, and the scheduler aims to finish 2 working days before the deadline.
- Owners are picked by: has the skills, then isn't blocked during the task, then most free time left (**planned ÷ available hours**, as you suggested), then alphabetical. The same input always gives the same plan.
- Any task without a `sourceLine` is dropped, with a warning.
- If the team doesn't have enough time, the plan can still run past the deadline. The backend doesn't hide that: you get a warning, and the late tasks appear in `risks`.

### Plan review: `GET` / `PUT` / `confirm`

- `load` lists **every** member in the order they were entered, including anyone with 0 planned hours.
- `plannedH` is the total `estimateH` of every task a member owns, done ones included.
- `availableH` uses the contract formula over a fixed window (the day planning started → the deadline). **It doesn't change when tasks are moved,** only when blocked days change (after a replan).
- `risks[].type` is one of:

  | `type` | Meaning |
  | --- | --- |
  | `over_capacity` | A member has more planned than available hours. |
  | `low_slack` | The last task in a chain is due less than 2 working days before the deadline. |
  | `past_deadline` | A task is due after the deadline. |
  | `unassigned` | A task has no owner. |
  | `dependency_conflict` | A task depends on something that is due later than it is. |

  You only show `detail`, which is a full sentence.
- Your week moves (start = Monday, due = Friday) are fine. Two dependent tasks in the **same week** are not flagged; a dependency in a **later** week is. That's the same rule your grid uses for its "Starts before ... is due" hint.
- `PUT` also warns (without rejecting the edit) when a task's owner isn't on the team or a task depends on an id that doesn't exist. Task ids must be unique (400 otherwise).

### Dashboard: `PATCH` / `notifications`

- A notification appears when `status !== "done"`, the task has an owner, and `due` is at most 2 days after `today` (or already past).
- `daysLeft` counts calendar days and is negative when overdue. Notifications are sorted most urgent first.
- Messages look like:
  - `'Gather market size statistics' is due in 1 day and hasn't been started.`
  - `'Collect survey responses' is 4 days overdue.` (in progress, so no "hasn't been started")
- `notionUrl` stays `null` until a Notion workspace has actually been created (see below).

### Replan: `replan` / `replan/confirm`

- Only the away member's **to-do** tasks that lose working days are touched. Done and in-progress tasks, and everyone else's tasks, are never changed. If an in-progress task overlaps the absence, there's a warning instead.
- For each affected task the backend first tries to **reassign** it (to someone with the skills, free during that time, with the hours to spare). If that's impossible it **pushes** the due date, and if even that won't fit before the deadline it adds a warning.
- So `changes` can include `owner` **and** `due` entries (your pop-up already handles both). `start` doesn't change today, but it's allowed by the contract.
- `explanation` is two sentences built only from the changes. For the demo:

  > Sam is unavailable from 2026-10-20 to 2026-10-24, which affects 3 of their open tasks. "Analyse survey responses" and "Segment the target market" move to Jo; "Gather market size statistics" stays with Sam but is now due 2026-10-27 instead of 2026-10-21.

  The `changes` are `t4` owner Sam → Jo, `t7` due 2026-10-21 → 2026-10-27, and `t6` owner Sam → Jo.
- **`loadAfter` lists only members whose numbers changed** (for the demo: Jo 12 → 21h, and Sam's hours and availability both drop). That matches the contract example. Your pop-up builds its rows from `loadAfter`, so it will show just those people. If you'd rather list everyone, merge it with the current `plan.load`.
- After confirm, the away member's absence is saved as blocked days, so their `availableH` in the returned PlanView is lower. Reporting the same absence again proposes no changes.
- A proposal only works once. Confirming it, or any `PUT /plan` edit, discards all open proposals (404 if they're used afterwards). Cancel needs no call.

---

## What isn't connected yet

The backend loads Role 1's and Role 4's functions on start and uses a stand-in for any that aren't merged. The responses have the same shapes either way, so **nothing changes on your side when they land**.

| Missing | What you'll see until it's merged |
| --- | --- |
| Role 1 brief reading (`extractBrief`, `decompose`) | `POST /` ignores the pasted brief and returns the MK301 tasks scheduled for your team, with the warning *"Brief reading isn't connected yet, so this is the MK301 demo plan rather than your brief."* |
| Role 1 `findNotifications` | A stand-in that follows the same 2-day rule. |
| Role 4 Notion (`createWorkspace` etc.) | Confirm works, `notionUrl` stays `null` (so the "Open in Notion" button is hidden), and the warning *"Plan confirmed, but the Notion workspace wasn't created: Notion sync isn't set up yet..."* appears. |

---

## Your assumptions, answered

1. **Members come from `load`:** yes. Every member is always listed, including anyone with 0 planned hours.
2. **Weeks (Monday/Friday dates):** fine. They don't change `availableH`, and same-week dependencies aren't flagged.
3. **`owner: null`:** accepted in `PUT`. It shows up as an `unassigned` risk.
4. **Stable ids:** task ids never change. A `proposalId` from `/replan` works in `/replan/confirm` once.
5. **Dates:** `YYYY-MM-DD` everywhere.
6. **Refresh:** `GET` returns the latest saved state, including `confirmed`. It survives a backend restart too.

---

## Switching over: checklist

1. Pull the `scheduler` branch (or wait for it to merge into `main`).
2. Set `USE_MOCK = false` in `apps/frontend/src/lib/api.ts`.
3. `npm run dev` from the repo root.
4. Open `/projects/p_mk301` and click through:
   - **Plan:** move a task, refresh, and check it stuck and the load bars didn't change size.
   - **Confirm:** the plan confirms and the Notion warning appears.
   - **Dashboard:** mark a task done, then set "Today is" to `2026-10-20` and check the reminders.
   - **Replan:** Sam, 2026-10-20 → 2026-10-24, gives 3 changes; Confirm, and t4 and t6 now show Jo.
5. To start over, delete `apps/backend/data/projects.json` and restart the backend.

Questions, or a field that needs to change → message Role 2 in chat before anyone edits `schemas.ts`.
