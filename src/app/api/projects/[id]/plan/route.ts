// Role 2: PUT /api/projects/{id}/plan -> reruns analysis (not the scheduler), returns PlanView
import { NextResponse } from "next/server";
import { UpdatePlanRequest } from "@/lib/schemas";
import { getProject, saveProject } from "@/lib/store";
import { err, planView } from "@/lib/http";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = getProject((await params).id);
  if (!p) return err("Project not found", 404);
  const parsed = UpdatePlanRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.message);
  p.tasks = parsed.data.tasks;
  saveProject(p);
  return NextResponse.json(planView(p));
}
