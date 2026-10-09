// Role 2 route, Role 1 logic: GET /api/projects/{id}/notifications?today=YYYY-MM-DD
import { NextResponse } from "next/server";
import { getProject } from "@/lib/store";
import { findNotifications } from "@/lib/notifications";
import { err } from "@/lib/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const p = getProject((await params).id);
  if (!p) return err("Project not found", 404);
  const today = new URL(req.url).searchParams.get("today") ?? new Date().toISOString().slice(0, 10);
  return NextResponse.json({ notifications: findNotifications(p.tasks, today), warnings: [] });
}
