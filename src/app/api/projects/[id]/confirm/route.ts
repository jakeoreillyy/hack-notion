// Role 2: POST /api/projects/{id}/confirm -> confirms, creates the Notion workspace.
// If Notion fails it still confirms and puts the failure in warnings.
import { NextResponse } from "next/server";
import { getProject, saveProject } from "@/lib/store";
import { createWorkspace } from "@/lib/notionSync";
import { err, planView } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = getProject((await params).id);
  if (!p) return err("Project not found", 404);
  p.state = "confirmed";
  const warnings: string[] = [];
  try {
    p.notionUrl = await createWorkspace(p);
  } catch (e) {
    warnings.push(`Notion: ${e instanceof Error ? e.message : String(e)}`);
  }
  saveProject(p);
  return NextResponse.json(planView(p, warnings));
}
