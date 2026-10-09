# Group Project Autopilot

A hackathon project for the Notion x Dublin AI Week student hackathon (one-day build, 2:20 PM to 5:35 PM, team of 5).

> **For AI agents reading this file:** you are helping ONE team member. Find their role in "The five roles" and work only on what that role owns. Treat `CONTRACT.md` content (section "Contract") as frozen. Do not edit files owned by another role; if you need a change there, tell your human to raise it in chat. When reviewing this plan, check your role's section for gaps, conflicts with other roles, or anything not buildable in the time, and report them to your human before coding.

---

## 1. Summary

Group Project Autopilot is a project manager that lives in the team's Notion. The team pastes in the assignment brief and marking rubric, enters the deadline, and adds each member's weekly hours, skills and blocked dates. It then:

- Turns the brief into a plan: criteria, deliverables, tasks, estimates, dependencies
- Maps every task to a rubric criterion, so nothing that earns marks is forgotten
- Assigns work fairly, from skills and real available hours
- Builds the Notion workspace: task board, timeline, team agreement
- Replans when life happens ("Sam is sick for 4 days") and explains what changed

It is on the students' side. No lecturer view, no score. The team sees the same plan and decides everything.

### Why it is not just a Claude chat

- **It keeps state:** plan, deadline, who does what.
- **It acts in the workspace:** writes to Notion.
- **The scheduling is code:** assignment, load balancing and replanning are deterministic, so the plan is repeatable and explainable.
- **It replans with a visible diff** the team approves.

### Framing rules (apply to every screen, prompt and slide)

- Estimates are guesses. The plan is a draft the team edits and confirms before anything is written to Notion.
- Never score or rank people. Show planned hours and task status only.
- Replans are proposals. Nothing changes until someone clicks Apply.
- Nothing is shared outside the team.

---

## 2. Scope for the day

**Must have (demo works with these):**
1. Brief + rubric -> criteria and tasks, shown in the app
2. Scheduler: owners, dates, load view, coverage gaps, risks
3. Create the Notion workspace
4. One replan ("member unavailable") with diff and Apply, updating Notion

**Roadmap slide only (do not build unless 1-4 are done and rehearsed):**
- Automatic nudges / comments with mentions
- Reading task status back from Notion
- Team agreement generation beyond a static template
- GitHub / Google Docs / Calendar integrations
- PDF / docx upload of the brief

---

## 3. Tech stack (decided, do not debate)

| Layer | Choice |
| --- | --- |
| Backend | Python 3.11, FastAPI, Pydantic models, run with `uvicorn` on port 8000 |
| State | In-memory dict, persisted to `data/projects.json` on each write (no database) |
| LLM | One provider, key in env var `LLM_API_KEY`. Wrapper in `apps/backend/src/llm.py` returning parsed JSON |
| Notion | Official `notion-client` Python SDK, token in env var `NOTION_TOKEN`, parent page id in `NOTION_PARENT_PAGE_ID` |
| Frontend | Lovable (React). Base URL from a single constant `API_BASE`. CORS is enabled on the backend for all origins |
| Dates | ISO strings `YYYY-MM-DD`. Weeks start Monday. Only weekdays count as working days |

Secrets go in `.env` (git-ignored). Provide `.env.example` with the variable names only.

---

## 4. Repo layout and ownership

```
/demo                              # R5
  brief_mk301.txt                  #   demo brief
  rubric_mk301.txt                 #   demo rubric
  team.json                        #   five demo members
  brief_essay.txt                  #   extra test brief (R5 writes, R1 tests)
  brief_software.txt               #   extra test brief
/apps/backend
  src/
    llm.py                         # R1  LLM wrapper
    extract.py                     # R1  brief -> criteria, deliverables
    decompose.py                   # R1  deliverables -> tasks
    scheduler.py                   # R2  assign + backward schedule
    analysis.py                    # R2  load, coverage, risks
    replan.py                      # R2  constraint change -> proposal
    store.py                       # R2  in-memory + JSON persistence
    routes.py                      # R2  all HTTP endpoints
    notion_sync.py                 # R4  create workspace, apply changes
  tests/                           # each role tests its own modules
/apps/frontend                     # R3 (Lovable, exported to repo)
  mock/response.json
CONTRACT.md                        # frozen at 2:40 (copy of section 5)
.env.example
```

Rules:
- One owner per file. Edit only your own files. Ask in chat before touching anyone else's.
- Branch per role: `r1-brief`, `r2-scheduler`, `r3-frontend`, `r4-notion`, `r5-pitch`. Small PRs into `main` at 3:15, 4:30 and 5:00. No force-pushes.
- `main` must always run. If it breaks, fix it before adding anything.

---

## 5. Contract (frozen at 2:40)

Agree and freeze in the first 20 minutes. If a field must change, say so out loud first and update this section in the same PR.

### 5.1 Core types

**Member:** `{ "name": str, "hours_per_week": number, "skills": [str], "blocked": ["YYYY-MM-DD"] }`

**Criterion:** `{ "id": "c1", "name": str, "weight": number, "description": str }`

**Task:**

```json
{
  "id": "t1",
  "title": "Collect competitor data",
  "criterion_ids": ["c1"],
  "owner": "Alex",
  "estimate_h": 4,
  "confidence": "medium",
  "start": "2026-10-12",
  "due": "2026-10-16",
  "depends_on": [],
  "status": "todo",
  "required_skills": ["research"],
  "source_line": "Students must analyse at least three competitors."
}
```

- `status`: `todo` | `doing` | `done`
- `confidence`: `low` | `medium` | `high`
- `owner`, `start`, `due` are `null` until the scheduler fills them
- `source_line` is mandatory. A task without one is a bug.
- `required_skills` uses the same vocabulary as member `skills`. Fixed skill list for the demo: `research`, `writing`, `data`, `design`, `presenting`, `coding`, `editing`

### 5.2 Python interfaces between modules (so roles can work in parallel)

```python
# R1 -> R2
extract.extract_brief(brief: str, rubric: str) -> dict
    # returns {"criteria": [Criterion], "deliverables": [{"id","title","description"}]}
decompose.decompose(criteria: list, deliverables: list) -> list[Task]
    # tasks with owner/start/due = None; includes source_line, required_skills

# R2 -> routes
scheduler.schedule(tasks, members, deadline) -> list[Task]            # fills owner, start, due
analysis.analyse(tasks, criteria, members, deadline) -> dict          # {"load", "coverage_gaps", "risks"}
replan.propose(project, change) -> dict                               # returns a proposal, see 5.3

# R4 <- routes
notion_sync.create_workspace(project) -> str                          # returns notion_url
notion_sync.apply_changes(project, changes: list[dict]) -> None       # updates existing Notion rows
```

R2 develops against a hand-written task list in `apps/backend/tests/fixtures/tasks.json` until R1's output is ready (target 3:00). R4 develops against a hand-written `project` fixture the same way.

### 5.3 HTTP API

All responses include `"warnings": []` (empty when nothing to flag). Errors return `{ "error": "message", "warnings": [] }` with an appropriate status code.

**`POST /projects`** creates the plan (runs extract, decompose, schedule, analyse).

Request:

```json
{
  "brief": "...",
  "rubric": "...",
  "deadline": "2026-11-06",
  "members": [
    { "name": "Alex", "hours_per_week": 8, "skills": ["research", "writing"], "blocked": ["2026-10-20"] }
  ]
}
```

Response:

```json
{
  "project_id": "p_1",
  "criteria": [ { "id": "c1", "name": "Market analysis", "weight": 25, "description": "..." } ],
  "tasks": [ { "id": "t1", "title": "Collect competitor data", "criterion_ids": ["c1"], "owner": "Alex", "estimate_h": 4, "confidence": "medium", "start": "2026-10-12", "due": "2026-10-16", "depends_on": [], "status": "todo", "required_skills": ["research"], "source_line": "Students must analyse at least three competitors." } ],
  "load": [ { "member": "Alex", "planned_h": 11, "available_h": 32 } ],
  "coverage_gaps": [ { "criterion_id": "c4", "name": "Critical evaluation of sources" } ],
  "risks": [ { "type": "low_slack", "detail": "Slides depend on analysis, due 3 days before deadline." } ],
  "warnings": []
}
```

**`PUT /projects/{id}/plan`** takes the team's edited tasks (`{ "tasks": [Task] }`), re-runs analysis (not the scheduler), and returns the same shape as `POST /projects`.

**`POST /projects/{id}/sync-notion`** creates the workspace. Returns `{ "notion_url": "...", "warnings": [] }`.

**`POST /projects/{id}/replan`**

Request: `{ "change": { "type": "unavailable", "member": "Sam", "from": "2026-10-20", "to": "2026-10-24" } }`

Response:

```json
{
  "proposal_id": "pr_1",
  "proposal": {
    "changes": [
      { "task_id": "t5", "field": "owner", "from": "Sam", "to": "Jo" },
      { "task_id": "t7", "field": "due", "from": "2026-10-22", "to": "2026-10-24" }
    ],
    "explanation": "Two plain-English sentences, generated only from the changes above."
  },
  "load_after": [ { "member": "Jo", "planned_h": 14, "available_h": 32 } ],
  "warnings": []
}
```

Only change type `unavailable` is supported. `changes[].field` is one of `owner`, `start`, `due`.

**`POST /projects/{id}/apply`**

Request: `{ "proposal_id": "pr_1" }`. Updates stored tasks and Notion. Returns `{ "ok": true, "tasks": [Task], "warnings": [] }`.

**`GET /projects/{id}`** returns the current state in the `POST /projects` response shape (used by the dashboard after reloads).

Stretch (not in the frozen contract): `POST /projects/{id}/refresh` for Notion status read-back and nudges.

### 5.4 Behaviour rules

- Every task has a `source_line`.
- The explanation text in a replan is a template filled from `changes`. It never contains facts that are not in `changes`.
- `confidence` comes from the model during decomposition and is shown in the UI.
- Task count target: 15 to 25.
- A criterion with no linked task appears in `coverage_gaps`.
- A member is overloaded when planned hours exceed available hours (`hours_per_week` times working weeks to deadline, minus blocked days at `hours_per_week / 5` each).

---

## 6. How it works

### Setup (once per project)

1. Team pastes the brief and rubric and enters the deadline.
2. Each member enters weekly hours, skills and blocked dates.
3. Model call 1 (R1): extract criteria and deliverables.
4. Model call 2 (R1): break deliverables into tasks with estimates, dependencies, skills and source lines.
5. Scheduler (R2): assign owners, backward-schedule from the deadline with buffer, run coverage and load analysis.
6. Team reviews and edits the plan, then clicks "Create in Notion" (R4).

### Replan

1. User marks a member unavailable for a date range.
2. R2's `replan.propose` reruns the scheduler with the new constraint, diffs against the current plan, and builds the explanation from the diff.
3. UI shows before and after.
4. On Apply, R2 updates the store and calls R4's `apply_changes`.

### Scheduling approach (R2)

Keep it simple and deterministic:
1. Topologically sort tasks by `depends_on`.
2. Work backwards from the deadline minus a buffer of 2 working days to set each task's `due`.
3. Assign each task to the member with matching skills and the lowest planned load who is available in the window. Ties break alphabetically by name so output is repeatable.
4. Set `start` from `due` and `estimate_h`, using the owner's daily hours.
5. Flag risks: dependency chain with under 2 days slack; owner over capacity; criterion uncovered.

### Where the data comes from

All inputs come from the team. No external dataset. Brief and rubric are pasted text.

### Known limits

- LLM estimates are rough. Show them as editable with a confidence tag.
- Notion rate limit is about 3 requests a second. Write rows in sequence, with a short sleep.
- Rubrics vary a lot. Test on three briefs, not one.
- We have not tested how well a model decomposes a brief. Keep tasks coarse and always show the source line.

---

## 7. The five roles

Each section lists what you own, what you receive, what you hand over, and when you are done.

### Role 1: Brief understanding (critical path)

**Owns:** `llm.py`, `extract.py`, `decompose.py`, tests for them.

**Tasks:**
1. `llm.py`: one function `call_json(system, user, schema) -> dict` with retry on invalid JSON (max 2 retries) and a 30 second timeout.
2. `extract_brief`: criteria (name, weight, description) and deliverables. Weights should sum to about 100; if not, add a warning.
3. `decompose`: 15 to 25 tasks, each with `criterion_ids`, `estimate_h`, `confidence`, `depends_on`, `required_skills`, and a `source_line` copied verbatim from the brief or rubric.
4. A validator that rejects tasks with no `source_line` or an unknown `criterion_id`.
5. Test on the demo brief plus the essay and software briefs from R5.

**Receives:** demo brief, rubric and extra briefs from R5 (first 40 minutes); the Task schema from section 5.1.
**Hands over:** working `decompose()` to R2 by 3:00. Until then R2 uses the hand-written fixture.
**Fallback:** if decomposition is weak at the 3:30 go/no-go, ship a template task list for the demo brief and keep the model for criteria extraction only.
**Done when:** the three test briefs each produce valid JSON that passes the validator, with at least one task per criterion on the demo brief except the deliberate gap.

### Role 2: Scheduler, replan, analysis, API (critical path)

**Owns:** `scheduler.py`, `analysis.py`, `replan.py`, `store.py`, `routes.py`, tests.

**Tasks:**
1. `routes.py` skeleton with every endpoint in 5.3 returning fixture data by 3:00, so R3 and R4 can connect early.
2. `store.py`: in-memory project store with JSON persistence.
3. `scheduler.schedule` as described in section 6.
4. `analysis.analyse`: load per member, coverage gaps, risks.
5. `replan.propose`: remove the unavailable window from the member's capacity, rerun the scheduler, diff, build the explanation from a template ("X is unavailable from A to B, so task T moves from X to Y.").
6. `/apply`: update the store, then call `notion_sync.apply_changes`.
7. Unit tests: repeatability (same input gives same output), overload detection, coverage gap, replan diff.

**Receives:** tasks from R1 (3:00), `create_workspace` and `apply_changes` from R4.
**Hands over:** a running API on port 8000 to R3 and R4; the fixture-backed skeleton by 3:00.
**Done when:** demo brief and team produce a plan with one visible overload and one coverage gap, and replanning "Sam unavailable" returns a stable, sensible diff.

### Role 3: Front end (Lovable)

**Owns:** `/apps/frontend`.

**Screens:**
1. **Setup:** paste brief, paste rubric, deadline, add members (name, hours, skill checkboxes from the fixed list, blocked dates).
2. **Plan review:** criteria with weights; task table (title, criterion, owner, estimate with confidence tag, start, due, source line on hover); inline edit; load bars per person; coverage gap banner; risks list; "Create in Notion" button.
3. **Dashboard:** task board view, Notion link, "Mark unavailable" form.
4. **Replan diff (visual centrepiece):** before and after for each changed task, the explanation text, load change, Apply and Cancel buttons.

**Build order:** screens on `mock/response.json` first, swap `API_BASE` to the real backend after 3:00 checkpoint.
**Receives:** the contract (section 5), mock JSON written from it in the first 40 minutes.
**Rules:** no scores or rankings anywhere in the UI; show a "draft, edit before confirming" label on the plan.
**Done when:** the full demo path runs from Setup to Apply against the real backend, and works on the demo laptop's screen size.

### Role 4: Notion and QA

**Owns:** `notion_sync.py`, tests for it, the bug list.

**Tasks (in order):**
1. First 20 minutes: create the Notion integration with read, write and comment capabilities and share the Hackathon HQ page with it. Put `NOTION_TOKEN` and `NOTION_PARENT_PAGE_ID` in `.env.example` names and share values with the team privately.
2. `create_workspace(project)`: under the parent page, create (a) a tasks database with properties Title, Owner, Criterion, Estimate, Due, Status, Depends on, Source; (b) a timeline view if the API allows, otherwise a second view note; (c) a "Team agreement" page from a static template; (d) a "Weekly check-in" page. Write rows one at a time with a small delay. Return the URL.
3. `apply_changes(project, changes)`: find rows by task id (store the Notion page id per task in the project record) and update Owner and Due.
4. End-to-end test of the whole flow on the demo project, and once on the team's own real project.
5. Keep a bug list in chat. Edge cases to test: empty brief, one member, deadline too close, all members blocked, duplicate task titles.

**Receives:** project fixture from R2 (before 3:00 it is hand-written).
**Hands over:** `create_workspace` and `apply_changes` to R2 by 4:00.
**Fallback:** if the Notion write is not working at 3:30, create a Notion page with a simple table of tasks. If mentions and comments fail, skip them (they are stretch anyway).
**Done when:** clicking "Create in Notion" produces a board you can open, and Apply changes visibly update the same board.

### Role 5: Product and pitch

**Owns:** `/demo`, slides, script, backup video.

**Tasks:**
1. First 20 minutes: write the demo brief and rubric (MK301 marketing group report plus presentation, 2,500 words, due in 4 weeks) and `team.json` with five members. Build in: one member deliberately overloaded, one rubric criterion that the brief does not obviously cover (so the coverage gap appears), and one member who will be marked unavailable live. Everyone else tests against these.
2. Write two more test briefs (an essay, a software project) for R1.
3. Competitor check in 10 minutes (Trello, Asana, Notion templates, Microsoft Planner, Teams) and a one-line "why students still fail at this" answer.
4. Team agreement template text for R4 to paste into Notion.
5. Pitch story, slides, demo script, backup recorded video, rehearsal (twice, timed).

**Receives:** the working flow from the team from about 4:20.
**Done when:** the demo script has been run end to end twice with a timer, and a backup video exists.

---

## 8. Schedule

| Time | R1 brief AI | R2 scheduler | R3 front end | R4 Notion/QA | R5 product/pitch |
| --- | --- | --- | --- | --- | --- |
| 2:20 to 2:40 | Freeze contract together | | | | |
| 2:40 to 3:30 | `llm.py`, criteria extraction | Skeleton routes on fixtures, scheduler | Screens on mock | Integration + workspace creation | Demo brief, team, competitors |
| 3:00 | Hand over decompose (or fixture stays) | | | | |
| 3:15 | PR to main | PR to main | PR to main | PR to main | PR to main |
| 3:30 | **Go / no-go checkpoint (all)** | | | | |
| 3:30 to 4:00 | Task decomposition | Coverage, load, risks | Plan review screen | Rows, properties, apply_changes | Team agreement, slide outline |
| 4:00 to 4:20 | Lunch | Lunch | Lunch | Lunch | Lunch |
| 4:20 to 5:00 | Tune on 3 briefs | Replan, apply, endpoints | Connect real endpoints, replan view | End-to-end tests | Slides and script |
| 4:30 | PR to main | PR to main | PR to main | PR to main | PR to main |
| 5:00 to 5:35 | Fixes | Fallbacks | Polish, backup video | Final QA | Rehearse |
| 5:35 | Submit | | | | |

**Go / no-go at 3:30:**
- If Notion writes fail, create a simple Notion page with a task table and say so.
- If task decomposition is weak, use a template task list for the demo brief and keep the model for criteria only.
- The demo works with plan, assignment, Notion board and one replan.

---

## 9. Definition of done (whole project)

- [ ] Pasting the demo brief produces criteria, 15-25 tasks with source lines, owners, dates
- [ ] Load view shows the deliberate overload; coverage gap is shown
- [ ] "Create in Notion" produces an openable board
- [ ] "Sam unavailable" produces a diff and explanation; Apply updates the app and Notion
- [ ] No page ranks or scores people
- [ ] Demo rehearsed twice with a timer; backup video recorded
- [ ] `README` has setup steps and `.env.example` is present

---

## 10. Presenting it

- Open with the shared experience: "Everyone here has been in the group project that fell apart in week three."
- Paste a real-looking brief, and show the plan, the rubric coverage gap and the load view appearing.
- Click Create, and show the finished Notion workspace.
- Live replan: "Sam is sick for four days." Show the diff, the explanation, then Apply, and watch the Notion board update.
- State clearly that it is on the students' side: no scores, no lecturer view, the team decides.
- Close with the path forward: free for students, Premium for teams with integrations (GitHub, Docs, calendars), optional university licences that only get anonymised aggregate data.
- Keep a recorded backup in case the live API or Notion call fails.

---

## 11. Before 2:20

- Everyone sets up Lovable credits, an LLM API key and the Notion HQ.
- Role 4 creates the Notion integration and shares the HQ page with it.
- Role 5 writes the demo brief, rubric and team in the first 20 minutes.
- Agree who owns which folder before anyone writes code.
