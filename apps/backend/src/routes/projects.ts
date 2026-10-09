// Role 2: one handler per endpoint in CONTRACT.md. Paths are relative to /api/projects.
import { Router } from "express";

export const projectsRouter = Router();

const todo = (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) =>
  res.status(501).json({ error: "not implemented", warnings: [] });

projectsRouter.post("/", todo); // create draft plan
projectsRouter.get("/:id", todo); // PlanView
projectsRouter.put("/:id/plan", todo); // edited tasks
projectsRouter.post("/:id/confirm", todo);
projectsRouter.patch("/:id/tasks/:taskId", todo); // status
projectsRouter.get("/:id/notifications", todo);
projectsRouter.post("/:id/replan", todo);
projectsRouter.post("/:id/replan/confirm", todo);
