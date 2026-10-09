// Role 2: builds the Express app. index.ts starts it; tests build their own with an in-memory store.
import express from "express";
import { readFileSync } from "node:fs";
import type { Project } from "./schemas";
import type { Deps } from "./lib/integrations";
import type { Store } from "./lib/store";
import { createProjectsRouter, errorHandler } from "./routes/projects";

export const DEMO_PROJECT_ID = "p_mk301";
const DEMO_START = "2026-10-12"; // Monday of the fixture's first week

export function createApp(store: Store, deps: Deps) {
  // The MK301 fixture is always available at /api/projects/p_mk301, so the frontend can connect early.
  if (!store.get(DEMO_PROJECT_ID)) {
    const { id, proposals, ...fields } = JSON.parse(
      readFileSync(new URL("./lib/fixtures/project.json", import.meta.url), "utf8"),
    ) as Project;
    store.create({ ...fields, startDate: DEMO_START }, id);
  }

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/projects", createProjectsRouter(store, deps));
  app.use((_req, res) => res.status(404).json({ error: "Not found.", warnings: [] }));
  app.use(errorHandler);
  return app;
}
