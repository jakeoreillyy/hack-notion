// Role 2: shared route helpers (error shape from CONTRACT.md).
import { NextResponse } from "next/server";
import { analyse } from "./analysis";
import type { PlanView, Project } from "./schemas";

export function err(error: string, status = 400) {
  return NextResponse.json({ error, warnings: [] }, { status });
}

export function planView(p: Project, warnings: string[] = []): PlanView {
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
