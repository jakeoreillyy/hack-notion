// Role 2: one handler per endpoint in CONTRACT.md. Paths are relative to /api/projects.
import { Router, type Response } from "express";
import { z } from "zod";
import {
  CreateProjectRequest,
  PatchTaskRequest,
  ReplanConfirmRequest,
  ReplanRequest,
  Task,
  UpdatePlanRequest,
  type PlanView,
  type ReplanProposal,
} from "../schemas";
import { analyse } from "../lib/analysis";
import { scheduleWithWarnings } from "../lib/scheduler";
import { applyReplan, proposeReplan } from "../lib/replan";
import type { Deps } from "../lib/integrations";
import type { Store, StoredProject } from "../lib/store";

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Errors use the contract's shape: { error, warnings }. */
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const detail = result.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));
  throw new HttpError(400, `Invalid request. ${detail.join("; ")}`);
}

export function toPlanView(p: StoredProject, warnings: string[] = []): PlanView {
  return {
    projectId: p.id,
    state: p.state,
    criteria: p.criteria,
    tasks: p.tasks,
    ...analyse(p),
    notionUrl: p.notionUrl,
    warnings,
  };
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createProjectsRouter(store: Store, deps: Deps): Router {
  const router = Router();

  const load = (id: string): StoredProject => {
    const p = store.get(id);
    if (!p) throw new HttpError(404, `No project with id ${id}.`);
    return p;
  };

  // Create a draft plan: Role 1 reads the brief, the scheduler places the tasks.
  router.post("/", async (req, res) => {
    const body = parse(CreateProjectRequest, req.body);
    const today = deps.today();
    const names = body.members.map((m) => m.name);
    if (new Set(names).size !== names.length) throw new HttpError(400, "Member names must be unique.");
    if (body.deadline <= today) throw new HttpError(400, `The deadline (${body.deadline}) has to be after today (${today}).`);

    const warnings: string[] = [];
    if (deps.fallbacks.includes("extractBrief") || deps.fallbacks.includes("decompose")) {
      warnings.push("Brief reading isn't connected yet, so this is the MK301 demo plan rather than your brief.");
    }

    let criteria, tasks;
    try {
      const extracted = await deps.extractBrief(body.brief, body.rubric);
      criteria = extracted.criteria;
      tasks = await deps.decompose(extracted.criteria, extracted.deliverables);
    } catch (e) {
      throw new HttpError(502, `Couldn't read the brief: ${message(e)}`);
    }

    // Keep only tasks that match the contract; a task without a sourceLine is a bug, so drop it loudly.
    const valid: Task[] = [];
    for (const raw of tasks) {
      const t = Task.safeParse(raw);
      if (t.success) valid.push({ ...t.data, owner: null, start: null, due: null, status: "todo" });
      else warnings.push(`Dropped a task that didn't match the contract: ${JSON.stringify(raw).slice(0, 80)}`);
    }
    if (valid.length === 0) warnings.push("No tasks came out of the brief.");

    const scheduled = scheduleWithWarnings(valid, body.members, body.deadline, today);
    const project = store.create({
      state: "draft",
      brief: body.brief,
      rubric: body.rubric,
      deadline: body.deadline,
      members: body.members,
      criteria,
      tasks: scheduled.tasks,
      notionUrl: null,
    });
    res.status(201).json(toPlanView(project, [...warnings, ...scheduled.warnings]));
  });

  router.get("/:id", (req, res) => {
    res.json(toPlanView(load(req.params.id)));
  });

  // The team's edits. Reruns analysis, not the scheduler.
  router.put("/:id/plan", (req, res) => {
    const project = load(req.params.id);
    const { tasks } = parse(UpdatePlanRequest, req.body);
    const ids = tasks.map((t) => t.id);
    if (new Set(ids).size !== ids.length) throw new HttpError(400, "Task ids must be unique.");

    const warnings: string[] = [];
    const members = new Set(project.members.map((m) => m.name));
    for (const t of tasks) {
      if (t.owner && !members.has(t.owner)) warnings.push(`"${t.title}" is owned by ${t.owner}, who isn't on the team.`);
      for (const d of t.dependsOn) if (!ids.includes(d)) warnings.push(`"${t.title}" depends on missing task ${d}.`);
    }
    // Edits make any open replan proposal stale.
    res.json(toPlanView(store.put({ ...project, tasks, proposals: {}, replanRequests: {} }), warnings));
  });

  // Confirm the plan and create the Notion workspace. A Notion failure still confirms, with a warning.
  router.post("/:id/confirm", async (req, res) => {
    const project = { ...load(req.params.id), state: "confirmed" as const };
    const warnings: string[] = [];
    if (!project.notionUrl) {
      try {
        project.notionUrl = await deps.createWorkspace(project);
      } catch (e) {
        warnings.push(`Plan confirmed, but the Notion workspace wasn't created: ${message(e)}`);
      }
    }
    res.json(toPlanView(store.put(project), warnings));
  });

  router.patch("/:id/tasks/:taskId", async (req, res) => {
    const project = load(req.params.id);
    const { status } = parse(PatchTaskRequest, req.body);
    const task = project.tasks.find((t) => t.id === req.params.taskId);
    if (!task) throw new HttpError(404, `No task with id ${req.params.taskId}.`);
    task.status = status;
    store.put(project);

    const warnings: string[] = [];
    if (project.notionUrl) {
      try {
        await deps.updateTaskStatus(project, task.id, status);
      } catch (e) {
        warnings.push(`Status saved, but Notion wasn't updated: ${message(e)}`);
      }
    }
    res.json(toPlanView(project, warnings));
  });

  // `today` is optional so the demo can show a notification on demand.
  router.get("/:id/notifications", (req, res) => {
    const project = load(req.params.id);
    const today = req.query.today === undefined ? deps.today() : parse(DateStr, req.query.today);
    res.json({ notifications: deps.findNotifications(project.tasks, today), warnings: [] });
  });

  // Propose only: nothing changes until /replan/confirm.
  router.post("/:id/replan", (req, res) => {
    const project = load(req.params.id);
    const { change } = parse(ReplanRequest, req.body);
    const result = proposeReplan(project, change);
    const proposal: ReplanProposal = { proposalId: store.newProposalId(), ...result };
    store.put({
      ...project,
      proposals: { ...project.proposals, [proposal.proposalId]: proposal },
      replanRequests: { ...project.replanRequests, [proposal.proposalId]: change },
    });
    res.json(proposal);
  });

  router.post("/:id/replan/confirm", async (req, res) => {
    const project = load(req.params.id);
    const { proposalId } = parse(ReplanConfirmRequest, req.body);
    const proposal = project.proposals[proposalId];
    const change = project.replanRequests[proposalId];
    if (!proposal || !change) throw new HttpError(404, `No open proposal with id ${proposalId}.`);

    // Refuse if the plan moved on since the proposal was made.
    for (const c of proposal.changes) {
      const task = project.tasks.find((t) => t.id === c.taskId);
      if (!task || task[c.field] !== c.from) {
        throw new HttpError(409, "The plan changed after this proposal was made. Ask for a new replan.");
      }
    }

    // Applying one proposal makes every other open one stale.
    const updated = { ...applyReplan(project, proposal.changes, change), proposals: {}, replanRequests: {} };
    store.put(updated);

    const warnings: string[] = [];
    if (updated.notionUrl && proposal.changes.length > 0) {
      try {
        await deps.applyChanges(updated, proposal.changes);
      } catch (e) {
        warnings.push(`Replan applied, but Notion wasn't updated: ${message(e)}`);
      }
    }
    res.json(toPlanView(updated, warnings));
  });

  return router;
}

/** Express error handler that keeps every error in the contract's { error, warnings } shape. */
export function errorHandler(err: unknown, _req: unknown, res: Response, _next: unknown) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, warnings: [] });
  // express.json() parse errors carry a status of 400.
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) return res.status(status).json({ error: message(err), warnings: [] });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server.", warnings: [] });
}
