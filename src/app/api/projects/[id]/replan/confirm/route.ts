// Role 2: POST /api/projects/{id}/replan/confirm { proposalId } -> applies changes, updates Notion, returns PlanView
import { NextResponse } from "next/server";
import { ReplanConfirmRequest } from "@/lib/schemas";
import { getProject, saveProject } from "@/lib/store";
import { applyChanges } from "@/lib/notionSync";
import { err, planView } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = getProject((await params).id);
  if (!p) return err("Project not found", 404);
  const parsed = ReplanConfirmRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.message);
  const proposal = p.proposals[parsed.data.proposalId];
  if (!proposal) return err("Proposal not found", 404);

  for (const c of proposal.changes) {
    const task = p.tasks.find((t) => t.id === c.taskId);
    if (task) task[c.field] = c.to;
  }
  delete p.proposals[proposal.proposalId];
  saveProject(p);
  const warnings: string[] = [];
  try {
    await applyChanges(p, proposal.changes);
  } catch (e) {
    warnings.push(`Notion: ${e instanceof Error ? e.message : String(e)}`);
  }
  return NextResponse.json(planView(p, warnings));
}
