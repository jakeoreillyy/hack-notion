# Frontend → Backend handoff (Role 3 → Role 2)

What the web app does, which endpoints it calls, what it reads from each response, and what has to be true for it to work against the real backend.

**TL;DR:** the frontend follows `CONTRACT.md` and imports its types from `apps/backend/src/schemas.ts` (as `@contract`). If your endpoints return the PlanView / ReplanProposal shapes in `schemas.ts`, it should just work. Read "Assumptions" below for the few things that aren't obvious from the contract.

---

## How the frontend talks to you

- **Every call goes through one file:** [`src/lib/api.ts`](src/lib/api.ts). No page calls `fetch` directly.
- **Mock switch:** `export const USE_MOCK = true;` at the top of `api.ts`. While it's `true`, every function returns fake data from [`mock/response.json`](mock/response.json) and never hits the network. When your endpoints work, Role 3 flips it to `false`.
- **Routing:** pages call `/api/...` on port 3000. `next.config.ts` already proxies `/api/*` to `http://localhost:4000/api/*` (your Express app). No CORS setup needed.
- **Errors:** on a non-2xx response the frontend reads `body.error` and shows it to the user. Please keep error messages short and readable, since students see them.
- **Warnings:** `warnings` on PlanView and ReplanProposal is shown in a yellow box. Use it for "Notion failed but the plan was confirmed" and similar.

---

## The four screens and the endpoints they use

### 1. Start page (`/`)

The team pastes the brief and rubric, picks a deadline, and adds members (name, hours per week, skills, blocked dates).

| Calls | When |
| --- | --- |
| `POST /api/projects` with `CreateProjectRequest` | "Make draft plan" button |

The frontend validates before sending: brief and rubric not empty, deadline in the future, at least 1 member, every member has a name, hours > 0, at least one skill, and **names are unique**. Names are trimmed.

After the response comes back it navigates to `/projects/{projectId}`.

> This call runs the LLM, so it may take 10–30 s. The button shows "Making plan…" the whole time. Please don't time out early.

### 2. Plan review (`/projects/[id]` while `state === "draft"`)

Shows the draft plan for the team to edit before confirming.

| Calls | When |
| --- | --- |
| `GET /api/projects/{id}` | Page load (and after a refresh) |
| `PUT /api/projects/{id}/plan` with `{ tasks }` | **Every** edit (owner, week or hours changes) |
| `POST /api/projects/{id}/confirm` | "Confirm plan" button |

**What it shows from PlanView:**

- `criteria`: name, weight, and how many tasks link to each (counted from `tasks[].criterionIds`)
- `coverageGaps`: a red banner listing uncovered criteria
- `load`: one bar per member, `plannedH` / `availableH`, red when over
- `risks`: a "Things to watch" list (only `detail` is shown, `type` is ignored)
- `tasks`: a **week-by-person grid**. See "Weeks" below.

**After each `PUT`** the frontend replaces its whole plan with your response, so `load` and `coverageGaps` must be recalculated (as the contract says: re-run analysis, not the scheduler).

### 3. Dashboard (`/projects/[id]` while `state === "confirmed"`)

| Calls | When |
| --- | --- |
| `GET /api/projects/{id}` | Page load |
| `PATCH /api/projects/{id}/tasks/{taskId}` with `{ status }` | To do / Doing / Done buttons on each task card |
| `GET /api/projects/{id}/notifications?today=YYYY-MM-DD` | Page load, after every status change, and when the "Today is" date control changes |

- Tasks are shown in three columns by `status`, sorted by `due`.
- `notionUrl` is shown as an "Open in Notion" button (hidden when `null`).
- The "I am" dropdown highlights tasks and notifications where `owner` matches. No logins.
- **`today` is always sent** (it defaults to the real date). Please honour it: the demo moves it forward to make a reminder appear.
- Only `notifications` is read from the notifications response. Each one shows `owner` and `message`, and turns red when `daysLeft < 0`.

### 4. Replan review (pop-up on the dashboard)

| Calls | When |
| --- | --- |
| `POST /api/projects/{id}/replan` with `{ change: { type: "unavailable", member, from, to } }` | "Suggest a new plan" button |
| `POST /api/projects/{id}/replan/confirm` with `{ proposalId }` | "Confirm changes" in the pop-up |

**What it shows from ReplanProposal:**

- `explanation`: shown as-is at the top
- `changes`: grouped by `taskId`, each shown as `from → to` (owner names as text, dates formatted like "Fri 23 Oct")
- `loadAfter`: compared with the current `load` to show "hours before → after" per member
- If `changes` is empty, the pop-up says nothing needs to change and only offers Close

After confirm, the frontend replaces its plan with the PlanView you return and tags the changed tasks as "Updated". Cancel sends nothing, so proposals that are never confirmed can just be dropped.

---

## Assumptions the frontend makes (please check these)

1. **The member list comes from `load`.** PlanView has no `members` array, so owner dropdowns, the "I am" dropdown, grid rows and the replan "Who" picker all use `load[].member`. **Every member must appear in `load`, including anyone with 0 planned hours.**
2. **Weeks.** The plan page groups tasks by the week of their `due` date (Monday to Friday). When someone moves a task to another week, the frontend sends `start = that Monday` and `due = that Friday` in the `PUT`. So expect edited tasks to have Monday/Friday dates. The dashboard and reminders still use the real `due` dates.
3. **Owners can be `null`.** Tasks with `owner: null` show in an "Unassigned" row, and the team can set `owner` back to `null` in the editor.
4. **IDs are stable.** `taskId`s must not change between `GET`, `PUT` and replan, and the `proposalId` from `/replan` must work in `/replan/confirm`.
5. **Dates** are `YYYY-MM-DD` everywhere, as in the contract.
6. **Refreshing the page** calls `GET /projects/{id}` and expects the latest saved state, including `state: "confirmed"` once confirmed.

---

## How the mock behaves (hints for the real logic)

`api.ts` contains rough mock versions of your logic so the screens could be built. They are **not** meant to replace yours, but they show what the screens expect:

- **Analysis after edits:** `plannedH` = sum of `estimateH` per owner, `availableH` unchanged, and `coverageGaps` = criteria with no task.
- **Replan:** the away member's unfinished tasks that overlap the window go to whoever has the **lowest `(plannedH + estimateH) / availableH`**, with ties broken alphabetically. The away member's `availableH` drops for the weekdays they're away. Only owners change in the mock. Yours can change `start`/`due` too, and the pop-up already handles that.
- **Notifications:** `status !== "done"`, has an owner, and `due` is within 2 days of `today` or overdue. Messages look like `'Draft survey questions' is due in 2 days and hasn't been started.`

> **Suggestion for the scheduler:** assign by lowest *planned ÷ available* hours rather than lowest *planned* hours. With raw hours, someone with little time (fewer hours or several blocked days) keeps getting tasks until they're overloaded. The ratio spreads work by how much time each person actually has.

---

## Connecting: checklist

1. Each endpoint returns the right shape. Fixture data is fine to start with, and the frontend can switch over as soon as any of these work.
2. Role 3 sets `USE_MOCK = false` in `src/lib/api.ts`.
3. Run both apps from the repo root with `npm run dev` (frontend on :3000, backend on :4000).
4. Click through: start page → plan (move a task, refresh, check it stuck) → Confirm (check the Notion link) → dashboard (mark done, move "today") → replan Sam → Confirm.

Questions or a field that needs to change → message Role 3 in chat before changing `schemas.ts`, since the frontend is typed against it.
