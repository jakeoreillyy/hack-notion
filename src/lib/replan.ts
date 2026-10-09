// Role 2: constraint change -> proposal. Explanation is a template filled from `changes`.
import type { Change, Load, Project } from "./schemas";

export type UnavailableChange = { type: "unavailable"; member: string; from: string; to: string };

export function proposeReplan(
  _p: Project,
  _change: UnavailableChange,
): { changes: Change[]; loadAfter: Load[]; explanation: string } {
  // TODO(Role 2): rerun the scheduler with the new blocked dates and diff against the current plan.
  return { changes: [], loadAfter: [], explanation: "No changes needed." };
}
