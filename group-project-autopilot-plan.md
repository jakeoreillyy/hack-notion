# Group Project Autopilot

A hackathon project for the Notion x Dublin AI Week student hackathon (one-day build, 2:20 PM to 5:35 PM, team of 5).

## The idea

Every student has been in a group project that fell apart the same way: nobody planned it properly, work got split unevenly, deadlines crept up, and the last week was chaos. The tools students have (WhatsApp, a blank Google Doc, a half-used Trello) do nothing about it.

Group Project Autopilot is a web page where a team pastes in the assignment brief and rubric, adds the team, and gets a plan. It:

- Turns the brief into tasks, each tied to a rubric criterion, so nothing that earns marks is forgotten
- Assigns work fairly, based on each person's skills and real available hours
- Shows the plan as a draft the team edits and confirms
- Builds a team dashboard and a Notion workspace (board, timeline, team agreement)
- Shows notifications on the dashboard when a task is nearing its deadline
- Replans when life happens ("Sam is sick for 4 days") and shows what changed before anything is applied

It is on the students' side. There is no lecturer view and no score. The whole team sees the same plan and decides everything.

## Example

**Input:** a 2,500-word marketing group report plus presentation, module "MK301", due in 4 weeks. Brief and rubric pasted in. Five members, each with weekly hours, skills and blocked days.

**Output (made up to show the format):**

- 6 rubric criteria extracted, e.g. "Market analysis (25%)", "Presentation delivery (15%)"
- 22 tasks, each tied to a criterion, with an owner, an estimate in hours, a start and a due date
- Load view: planned hours per person against their stated availability
- Coverage check: "No task yet covers 'Critical evaluation of sources' (15%)"
- Risks: "Slides depend on the analysis, which is due 3 days before the deadline. Little slack."
- A Notion workspace: task board, timeline, team agreement page
- Dashboard notification: "Alex: 'Collect competitor data' is due in 2 days and hasn't been started."
- Replan: Sam marks 4 days unavailable. The tool proposes moving two tasks to Jo and pushing one by 2 days, explains why, and the team clicks Confirm.

### Dashboard notifications

The dashboard shows a notification list for the whole team. A task creates a notification when it is not done and its due date is within 2 days (or it is overdue). Members set task status on the dashboard (`todo`, `doing`, `done`), so notifications clear as work gets done. A "which one is me" dropdown highlights your own tasks. For the demo, the dashboard has a "today" date control so the notification can be shown without waiting.

It must be framed carefully:

- Estimates are guesses. The plan is a draft the team edits and confirms before anything is written to Notion.
- No scoring of people. The tool shows planned hours and task status. It never ranks anyone.
- Notifications are about a task, never about the person's performance.
- Replans are proposals. Nothing changes until someone clicks Confirm.
- Nothing is shared outside the team. Anyone with the project link is on the team (no logins; say so in the pitch).

## Where the data comes from

All inputs come from the team on the input page. There is no external dataset.

- **Brief and rubric:** pasted text (PDF upload is a stretch).
- **Team:** name, weekly hours, skills (checkboxes from a fixed list), blocked dates.
- **Deadline:** entered by the team.
- **Progress:** task status set on the dashboard.
- **Output:** Notion API, creating the database and pages and updating rows.

### Known limits

- LLM estimates are rough. Show them as editable, with a confidence tag.
- Notion rate limits (about 3 requests a second). Write rows one at a time with a short delay.
- Rubrics vary a lot. Test on three briefs, not one.
- We have not tested how well a model breaks a brief into tasks. Keep tasks coarse (15 to 25) and always show the source line from the brief.
- Notion shows owners as text (the member's name), not as real Notion users.
- State is held in memory and a JSON file. This is fine for a demo, not for real use.

### Do we need an LLM API?

Yes for reading the brief. No for the scheduling.

| Use | Needed? | Fallback without an API |
| --- | --- | --- |
| Extract criteria and deliverables from brief and rubric | Yes | Manual entry of criteria |
| Break deliverables into tasks with estimates | Yes | Template task list for the demo brief |
| Assign tasks to people | No | Deterministic scheduler (skills, hours, dependencies) |
| Backward-schedule from the deadline with buffer | No | Plain code |
| Coverage check (criteria with no tasks) | No | Set comparison |
| Replan on an absence | No | Same scheduler with new constraints |
| Explain a replan | No | Template filled with the changes |
| Dashboard notifications | No | Date comparison |

Recommendation: the model reads and drafts, code decides. Anything a student relies on (who does what, by when) comes from the scheduler, so it is repeatable and explainable.

## How it works

### Setup (once per project)

1. Team pastes the brief and rubric and enters the deadline and members.
2. Model call 1: extract criteria (name, weight, description) and deliverables.
3. Model call 2: break deliverables into tasks with estimate, dependencies, skills and a source line.
4. Scheduler assigns owners and dates. Coverage and load checks run.
5. Team reviews and edits the draft plan, then clicks **Confirm plan**.
6. On confirm: the dashboard opens and the Notion workspace is created.

### Live (on the dashboard)

1. **Status:** members set task status; the change is mirrored to the Notion row.
2. **Notify:** tasks due within 2 days that are not done appear in the notification list.
3. **Replan:** someone marks a member unavailable; the scheduler reruns with that constraint and the dashboard shows a before and after diff with an explanation.
4. **Confirm:** on Confirm replan, the plan and the Notion board update.

### Scheduling approach

1. Sort tasks by dependencies.
2. Work backwards from the deadline minus a 2 working-day buffer to set each task's due date.
3. Assign each task to the member whose skills match and who has the lowest planned load and is free in the window. Ties break alphabetically so output is repeatable.
4. Set the start date from the due date and the estimate.
5. Flag risks: a dependency chain with under 2 days slack, an owner over capacity, a criterion with no task.

## Working concurrently

The roles only stay independent if two things are nailed down **before** anyone splits up: the shape of the shared types and the shape of the API responses. Everything below exists so every role can start against fake data at 2:40 instead of waiting on someone else.

**First 20 minutes, all five together:** read and agree `CONTRACT.md` and the types below. Treat them as frozen after that. If a field must change, say so out loud before editing, since the other roles are coding against it.

> **For AI agents reading this file:** you are helping ONE team member. Work only in the folder your role owns, treat the contract as frozen, and flag any gap or conflict to your human before coding.

### Stack (one TypeScript app, decided)

- **Framework:** Next.js (App Router) with TypeScript. One app, one `npm run dev`, one deploy. Pages and API routes live together.
- **Styling:** Tailwind CSS, with shadcn/ui components for tables, dialogs and toasts.
- **Validation and shared types:** `zod` schemas in `src/lib/schemas.ts`, used by both API routes and pages. A type error means a contract mismatch.
- **LLM:** Anthropic SDK, key in `ANTHROPIC_API_KEY` (model in `ANTHROPIC_MODEL`), wrapped in `src/lib/llm.ts`.
- **Notion:** `@notionhq/client`, token in `NOTION_TOKEN`, parent page in `NOTION_PARENT_PAGE_ID`.
- **State:** in-memory `Map` saved to `data/projects.json`. No database.
- **Dates:** `YYYY-MM-DD`, weekdays only count as working days.

### Repo layout

Each role owns files and does not edit another role's. The only shared files are `CONTRACT.md` and `src/lib/schemas.ts`, and those are frozen after the first 20 minutes.

```
/src/lib                          # server logic, plain TypeScript
  schemas.ts                      # Role 2: zod types for everything in CONTRACT.md
  llm.ts                          # Role 1: LLM wrapper returning validated JSON
  extract.ts                      # Role 1: brief -> criteria, deliverables
  decompose.ts                    # Role 1: deliverables -> tasks
  notifications.ts                # Role 1: which tasks need a dashboard notification
  scheduler.ts                    # Role 2: assign + backward schedule
  analysis.ts                     # Role 2: load, coverage, risks
  replan.ts                       # Role 2: constraint change -> proposal
  store.ts                        # Role 2: state and persistence
  notionSync.ts                   # Role 4: create workspace, update rows
  fixtures/                       # Role 2: hand-written tasks.json and project.json

/src/app/api                      # Role 2: route handlers for every endpoint in CONTRACT.md

/src/app                          # Role 3: pages
  page.tsx                        #   input page
  projects/[id]/page.tsx          #   plan review and dashboard
/src/components                   # Role 3
/mock/response.json              # Role 3: hand-written example matching CONTRACT.md

/demo
  brief_mk301.txt  rubric_mk301.txt  team.json    # Role 5
  brief_essay.txt  brief_software.txt             # Role 5, extra test briefs

CONTRACT.md                       # frozen API shape, see below
.env.example                      # variable names only
```

### Git workflow

- Branch per role: `brief`, `scheduler`, `web`, `notion`, `pitch`, off `main`.
- Commit often on your own branch. Open small PRs into `main` at 3:15, 4:30 and 5:00.
- Anything touching another role's folder is flagged in chat first, and kept to one line.
- Run `npm run typecheck` before every PR. Never force-push over someone else's branch.

### API contract (`CONTRACT.md`) — freeze by 2:40

**Types**

```ts
Skill      = "research" | "writing" | "data" | "design" | "presenting" | "coding" | "editing"
Member     = { name: string, hoursPerWeek: number, skills: Skill[], blocked: string[] }
Criterion  = { id: string, name: string, weight: number }
Task = {
  id: string, title: string, criterionIds: string[],
  owner: string | null, estimateH: number, confidence: "low" | "medium" | "high",
  start: string | null, due: string | null, dependsOn: string[],
  status: "todo" | "doing" | "done", requiredSkills: Skill[], sourceLine: string
}
Notification = { taskId: string, owner: string, message: string, daysLeft: number }
```

Every task has a `sourceLine`; a task without one is a bug. Member names are unique within a project.

**`POST /projects`** creates a draft plan.

Request:

```json
{
  "brief": "...",
  "rubric": "...",
  "deadline": "2026-11-06",
  "members": [
    { "name": "Alex", "hoursPerWeek": 8, "skills": ["research", "writing"], "blocked": ["2026-10-20"] }
  ]
}
```

Response (called **PlanView** below):

```json
{
  "projectId": "p_1",
  "state": "draft",
  "criteria": [ { "id": "c1", "name": "Market analysis", "weight": 25 } ],
  "tasks": [ { "id": "t1", "title": "Collect competitor data", "criterionIds": ["c1"], "owner": "Alex", "estimateH": 4, "confidence": "medium", "start": "2026-10-12", "due": "2026-10-16", "dependsOn": [], "status": "todo", "requiredSkills": ["research"], "sourceLine": "Students must analyse at least three competitors." } ],
  "load": [ { "member": "Alex", "plannedH": 11, "availableH": 32 } ],
  "coverageGaps": [ { "criterionId": "c4", "name": "Critical evaluation of sources" } ],
  "risks": [ { "type": "low_slack", "detail": "Slides depend on analysis, due 3 days before deadline." } ],
  "notionUrl": null,
  "warnings": []
}
```

**`PUT /projects/{id}/plan`**: the team's edited tasks as `{ "tasks": [...] }`. Reruns analysis (not the scheduler) and returns PlanView.

**`POST /projects/{id}/confirm`**: sets `state` to `confirmed` and creates the Notion workspace. Returns PlanView with `notionUrl` filled in. If Notion fails, it still confirms and puts the failure in `warnings`.

**`GET /projects/{id}`**: returns PlanView. The dashboard calls this.

**`PATCH /projects/{id}/tasks/{taskId}`**: request `{ "status": "doing" }`. Updates the task, mirrors it to Notion, returns PlanView.

**`GET /projects/{id}/notifications?today=2026-10-14`**: `today` is optional (defaults to the real date) and exists so the demo can show a notification on demand.

```json
{
  "notifications": [
    { "taskId": "t3", "owner": "Sam", "message": "'Draft survey questions' is due in 2 days and hasn't been started.", "daysLeft": 2 }
  ],
  "warnings": []
}
```

**`POST /projects/{id}/replan`**: request `{ "change": { "type": "unavailable", "member": "Sam", "from": "2026-10-20", "to": "2026-10-24" } }`. Nothing is stored as changed yet.

```json
{
  "proposalId": "pr_1",
  "changes": [
    { "taskId": "t5", "field": "owner", "from": "Sam", "to": "Jo" },
    { "taskId": "t7", "field": "due", "from": "2026-10-22", "to": "2026-10-24" }
  ],
  "loadAfter": [ { "member": "Jo", "plannedH": 14, "availableH": 32 } ],
  "explanation": "Two plain-English sentences, generated only from the changes above.",
  "warnings": []
}
```

**`POST /projects/{id}/replan/confirm`**: request `{ "proposalId": "pr_1" }`. Applies the changes, updates Notion, returns PlanView.

- `changes[].field` is one of `owner`, `start`, `due`. Only the `unavailable` change type exists.
- `warnings` is always present, empty when there is nothing to flag.
- Errors return `{ "error": "message", "warnings": [] }` with an appropriate status.
- A task creates a notification when `status !== "done"`, it has an owner, and `due` is within 2 days of today or past.
- The replan explanation is a template filled from `changes`, so it cannot invent facts.
- A member is overloaded when planned hours exceed `hoursPerWeek` times working weeks to the deadline, minus `hoursPerWeek / 5` per blocked weekday.
- Role 3 builds against `mock/response.json` until the real endpoints exist, then switches to calling `/api/...`.

### Function interfaces between modules

```ts
extractBrief(brief, rubric): Promise<{ criteria: Criterion[]; deliverables: Deliverable[] }>   // Role 1
decompose(criteria, deliverables): Promise<Task[]>                                              // Role 1, owner/start/due null
findNotifications(tasks, today): Notification[]                                                 // Role 1
schedule(tasks, members, deadline): Task[]                                                      // Role 2
analyse(project): { load, coverageGaps, risks }                                                 // Role 2
proposeReplan(project, change): { changes, loadAfter, explanation }                             // Role 2
createWorkspace(project): Promise<string>        // returns notionUrl                           // Role 4
applyChanges(project, changes): Promise<void>                                                   // Role 4
updateTaskStatus(project, taskId, status): Promise<void>                                        // Role 4
```

Role 2 and Role 4 develop against the hand-written fixtures until Role 1's real output exists (target 3:00).

## The five roles

### Role 1: brief understanding and notifications (critical path)

- Prompts to extract criteria and deliverables and to break them into tasks, with a validator that rejects tasks with no source line
- Test on the demo brief and two other briefs (essay, software project)
- `findNotifications`: the 2-day rule from the contract (from about 3:30)
- Hands tasks to Role 2 by 3:00; Role 2 uses the fixture until then

### Role 2: scheduler, replan and API (critical path)

- Owns the shared types, published in the first 30 minutes
- Skeleton endpoints returning fixture data by 3:00 so everyone can connect early
- Scheduler, load view, coverage check, risk rules
- Replan diff with the explanation template
- State and persistence

### Role 3: web app (Next.js pages and components)

- Input page: brief, rubric, deadline, members
- Plan review page: editable task table, load bars, coverage gap banner, risks, **Confirm plan**
- Dashboard: tasks by status with a status control, notification list, "I am" dropdown, "today" control, Notion link, mark-someone-unavailable form
- Replan diff view with Confirm and Cancel is the visual centrepiece
- Build against mock JSON first, then connect to the real endpoints

### Role 4: Notion and QA

- Create the Notion integration and share the HQ page with it in the first 20 minutes
- Workspace creation: task database, timeline or board view, team agreement page, weekly check-in page
- Update rows on status change and on a confirmed replan
- Test the whole flow on the demo project and on your own team's real project; keep a bug list and test edge cases (empty brief, one member, all members blocked, Notion failure)

### Role 5: product and pitch

- Demo brief, rubric and five demo members, with one deliberate overload, one gap in rubric coverage, and one member (Sam) to mark unavailable live
- Two extra test briefs for Role 1
- Competitor check (Trello, Asana, Notion templates, Microsoft Planner, Teams) and the "why students still fail at this" line
- Team agreement template text, pitch story, slides, demo script, backup video, rehearsal

## Schedule

| Time | R1 brief AI | R2 scheduler/API | R3 web | R4 Notion/QA | R5 pitch |
| --- | --- | --- | --- | --- | --- |
| 2:20 to 2:40 | Freeze contract together | | | | |
| 2:40 to 3:30 | Criteria extraction | Types, skeleton routes, scheduler | Input and plan review on mock | Integration, workspace creation | Demo brief, team, competitors |
| 3:30 to 4:00 | Task decomposition | Coverage, load, risks | Dashboard and notifications | Rows, status updates | Team agreement, slide outline |
| 4:00 to 4:20 | Lunch | Lunch | Lunch | Lunch | Lunch |
| 4:20 to 5:00 | Tune on 3 briefs, notifications | Replan and confirm routes | Connect real endpoints, replan view | End-to-end tests | Slides and script |
| 5:00 to 5:35 | Fixes | Fallbacks | Polish, backup video | Final QA | Rehearse |
| 5:35 | Submit | | | | |

**Go or no-go at 3:30.** If Notion writes fail, create a single Notion page with a task table and say so. If task decomposition is weak, use a template task list for the demo brief and keep the model for criteria extraction only. The demo works with plan, confirm, dashboard, Notion board and one replan.

## Build order

1. Brief to criteria and tasks, shown in the app
2. Scheduler: owners, dates, load view, coverage gaps
3. Confirm plan, dashboard and the Notion workspace
4. Dashboard notifications
5. Replan with diff and Confirm
6. Stretch: GitHub or calendar links, PDF upload, real Notion users as owners

Steps 1 to 3 make a working demo. The replan with a visible diff is the best second moment, so build it before any stretch item. If notifications are not working by 5:00, cut them and keep the rest.

## Presenting it

- Open with the shared experience: "Everyone here has been in the group project that fell apart in week three."
- Paste a real-looking brief, and show the plan, the rubric coverage gap and the load view appearing.
- Click Confirm, and show the dashboard and the finished Notion workspace.
- Move the "today" date forward and show the notification for a task nearing its deadline.
- Live replan: "Sam is sick for four days." Show the diff, the explanation, then Confirm, and watch the Notion board update.
- State clearly that it is on the students' side: no scores, no lecturer view, the team decides.
- Close with the path forward: free for students, Premium for teams with integrations (GitHub, Docs, calendars), optional university licences that only get anonymised aggregate data.
- Keep a recorded backup in case the live API or Notion call fails.

## Before 2:20

- Everyone sets up an LLM API key, Node 20, and the Notion HQ.
- Role 4 creates a Notion integration with read and write access and shares the HQ page with it.
- Role 5 writes the demo brief, rubric and team in the first 20 minutes. Everything else is tested against them.
- Push the repo skeleton: the folders above, an empty `CONTRACT.md`, `.gitignore`, `.env.example`, and the five branches.
- Agree who owns which folder before anyone writes code.
