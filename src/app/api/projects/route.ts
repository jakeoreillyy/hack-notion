// Role 2: POST /api/projects -> draft PlanView
import { NextResponse } from "next/server";
import { CreateProjectRequest, type Project } from "@/lib/schemas";
import { extractBrief } from "@/lib/extract";
import { decompose } from "@/lib/decompose";
import { schedule } from "@/lib/scheduler";
import { newProjectId, saveProject } from "@/lib/store";
import { err, planView } from "@/lib/http";

export async function POST(req: Request) {
  const parsed = CreateProjectRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return err(parsed.error.message);
  const { brief, rubric, deadline, members } = parsed.data;

  const { criteria, deliverables } = await extractBrief(brief, rubric);
  const tasks = schedule(await decompose(criteria, deliverables), members, deadline);
  const project: Project = {
    id: newProjectId(), state: "draft", brief, rubric, deadline, members,
    criteria, tasks, notionUrl: null, proposals: {},
  };
  saveProject(project);
  return NextResponse.json(planView(project));
}
