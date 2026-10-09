// Role 1: brief + rubric -> criteria and deliverables.
import type { Criterion, Deliverable } from "./schemas";
import fixture from "./fixtures/project.json";

export async function extractBrief(
  _brief: string,
  _rubric: string,
): Promise<{ criteria: Criterion[]; deliverables: Deliverable[] }> {
  // TODO(Role 1): model call 1. Stub returns the fixture's criteria.
  return {
    criteria: fixture.criteria,
    deliverables: [
      { id: "d1", title: "Competitor analysis", criterionIds: ["c1"], sourceLine: "Students must analyse at least three competitors." },
    ],
  };
}
