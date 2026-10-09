// Role 2: PATCH /api/projects/{id}/tasks/{taskId} { status } -> mirrors to Notion, returns PlanView
import { NextResponse } from "next/server";
import { PatchTaskRequest } from "@/lib/schemas";
import { getProject, saveProject } from "@/lib/store";
import { updateTaskStatus } from "@/lib/notionSync";
import { err, planView } from "@/lib/http";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params;
  const p = getProject(id);
  if (!p) return err("Project not found", 404);
  const task = p.tasks.find((t) => t.id === taskId);
  if (!task) return err("Task not found", 404);
  const parsed = PatchTaskRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.message);

  task.status = parsed.data.status;
  saveProject(p);
  const warnings: string[] = [];
  try {
    await updateTaskStatus(p, taskId, task.status);
  } catch (e) {
    warnings.push(`Notion: ${e instanceof Error ? e.message : String(e)}`);
  }
  return NextResponse.json(planView(p, warnings));
}
