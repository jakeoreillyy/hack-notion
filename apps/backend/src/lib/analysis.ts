// Role 2: analyse(project) -> { load, coverageGaps, risks }
// Pure: no I/O, no clock.
import type { CoverageGap, Load, Member, Project, Risk, Task } from "../schemas";
import { BUFFER_DAYS } from "./scheduler";
import { availableHours, byId, round1, workingDaysAfter } from "./dates";

export type Analysis = { load: Load[]; coverageGaps: CoverageGap[]; risks: Risk[] };

/** `startDate` (when planning began) pins the capacity window, so moving tasks never changes availableH. */
export type AnalysisInput = Pick<Project, "members" | "criteria" | "tasks" | "deadline"> & { startDate?: string };

export function analyse(project: AnalysisInput): Analysis {
  const { members, criteria, tasks, deadline } = project;
  const load = computeLoad(members, tasks, deadline, project.startDate);

  const covered = new Set(tasks.flatMap((t) => t.criterionIds));
  const coverageGaps = criteria.filter((c) => !covered.has(c.id)).map((c) => ({ criterionId: c.id, name: c.name }));

  return { load, coverageGaps, risks: findRisks(tasks, load, deadline) };
}

/**
 * The window runs from `from` (the project's start date) to the deadline. Without one it falls back
 * to the earliest task start; either way it never reads the clock. Planned hours count every task
 * the member owns, done ones included, because availability covers the whole project too.
 */
export function computeLoad(members: Member[], tasks: Task[], deadline: string, from = planStart(tasks, deadline)): Load[] {
  return members.map((m) => ({
    member: m.name,
    plannedH: round1(tasks.filter((t) => t.owner === m.name).reduce((sum, t) => sum + t.estimateH, 0)),
    availableH: availableHours(m, from, deadline),
  }));
}

export function planStart(tasks: Task[], deadline: string): string {
  return tasks.reduce((min, t) => (t.start && t.start < min ? t.start : min), deadline);
}

function findRisks(tasks: Task[], load: Load[], deadline: string): Risk[] {
  const risks: Risk[] = [];
  const open = tasks.filter((t) => t.status !== "done").sort(byId);
  const byTaskId = new Map(tasks.map((t) => [t.id, t]));
  const hasDependents = new Set(tasks.flatMap((t) => t.dependsOn));

  for (const l of load) {
    if (l.plannedH > l.availableH) {
      risks.push({
        type: "over_capacity",
        detail: `${l.member} has ${l.plannedH}h planned but only ${l.availableH}h available.`,
      });
    }
  }

  for (const t of open) {
    if (!t.owner) risks.push({ type: "unassigned", detail: `"${t.title}" has no owner.` });
    if (!t.due) continue;

    if (t.due > deadline) {
      risks.push({ type: "past_deadline", detail: `"${t.title}" is due ${t.due}, after the deadline (${deadline}).` });
    } else if (!hasDependents.has(t.id)) {
      // End of a dependency chain: how much room is left before hand-in?
      const slack = workingDaysAfter(t.due, deadline);
      if (slack < BUFFER_DAYS) {
        const detail =
          slack === 0
            ? `"${t.title}" is due on the deadline (${t.due}), with no time to spare.`
            : `"${t.title}" is due ${t.due}, only 1 working day before the deadline.`;
        risks.push({ type: "low_slack", detail });
      }
    }

    for (const d of t.dependsOn) {
      const dep = byTaskId.get(d);
      // Same rule as the plan grid: only a dependency due after this task is a conflict. Edits there are
      // whole weeks, so dependent tasks in the same week are fine.
      if (dep?.due && dep.due > t.due && dep.status !== "done") {
        risks.push({
          type: "dependency_conflict",
          detail: `"${t.title}" is due ${t.due} but depends on "${dep.title}", due ${dep.due}.`,
        });
      }
    }
  }
  return risks;
}
