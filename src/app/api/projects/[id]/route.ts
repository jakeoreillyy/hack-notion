// Role 2: GET /api/projects/{id} -> PlanView
import { NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { err, planView } from "@/lib/http";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = getProject((await params).id);
  if (!p) return err("Project not found", 404);
  return NextResponse.json(planView(p));
}
