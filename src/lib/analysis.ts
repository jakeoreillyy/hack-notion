// Role 2: load view, coverage check, risk rules.
import type { CoverageGap, Load, Project, Risk } from "./schemas";

export function analyse(p: Project): { load: Load[]; coverageGaps: CoverageGap[]; risks: Risk[] } {
  // TODO(Role 2): availability = hoursPerWeek * working weeks - hoursPerWeek/5 per blocked weekday.
  const load: Load[] = p.members.map((m) => ({
    member: m.name,
    plannedH: p.tasks.filter((t) => t.owner === m.name).reduce((s, t) => s + t.estimateH, 0),
    availableH: m.hoursPerWeek * 4,
  }));
  const covered = new Set(p.tasks.flatMap((t) => t.criterionIds));
  const coverageGaps = p.criteria.filter((c) => !covered.has(c.id)).map((c) => ({ criterionId: c.id, name: c.name }));
  return { load, coverageGaps, risks: [] };
}
