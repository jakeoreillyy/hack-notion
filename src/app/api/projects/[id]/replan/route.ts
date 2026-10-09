// Role 2: POST /api/projects/{id}/replan -> proposal. Nothing is stored as changed yet.
import { NextResponse } from "next/server";
import { ReplanRequest, type ReplanProposal } from "@/lib/schemas";
import { getProject, saveProject } from "@/lib/store";
import { proposeReplan } from "@/lib/replan";
import { err } from "@/lib/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = getProject((await params).id);
  if (!p) return err("Project not found", 404);
  const parsed = ReplanRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.message);

  const proposal: ReplanProposal = {
    proposalId: `pr_${Object.keys(p.proposals).length + 1}`,
    ...proposeReplan(p, parsed.data.change),
    warnings: [],
  };
  p.proposals[proposal.proposalId] = proposal;
  saveProject(p);
  return NextResponse.json(proposal);
}
