// Role 1: deliverables -> 15 to 25 coarse tasks. owner/start/due are null; every task needs a sourceLine.
import type { Criterion, Deliverable, Task } from "./schemas";
import fixture from "./fixtures/project.json";

export async function decompose(_criteria: Criterion[], _deliverables: Deliverable[]): Promise<Task[]> {
  // TODO(Role 1): model call 2 + validator. Stub returns fixture tasks with scheduling fields cleared.
  return (fixture.tasks as Task[]).map((t) => ({ ...t, owner: null, start: null, due: null }));
}
