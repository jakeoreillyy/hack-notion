// Role 2: assign owners + backward-schedule from the deadline (2 working-day buffer). Deterministic.
import type { Member, Task } from "./schemas";

export function schedule(tasks: Task[], _members: Member[], _deadline: string): Task[] {
  // TODO(Role 2): topo sort, backward schedule, assign by skills/load/availability, alphabetical tie-break.
  return tasks;
}
