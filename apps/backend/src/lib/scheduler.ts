// Role 2: schedule(tasks, members, deadline) -> Task[]
// Pure: no I/O, no clock. The same input always gives the same output.
//
// 1. Clean dependencies (unknown ids, self-references, cycles) and sort topologically.
// 2. Walk backwards from the deadline minus a 2 working-day buffer: each task is due the working day
//    before its earliest dependent starts.
// 3. Owner = has every required skill, then free (no blocked day in the window), then lowest load
//    (planned hours / weekly hours), then alphabetical.
// 4. Start = due minus the task's length in the owner's free working days (estimate / daily hours).
import type { Member, Task } from "../schemas";
import { addWorkingDays, byId, dailyHours, isBlockedBetween, isWeekday, prevWorkingDay } from "./dates";

export const BUFFER_DAYS = 2;

export type ScheduleResult = { tasks: Task[]; warnings: string[] };

/**
 * `today` is optional so the engine never reads the clock. Pass it from the route: without it, a
 * long chain can be scheduled to start in the past.
 */
export function schedule(tasks: Task[], members: Member[], deadline: string, today?: string): Task[] {
  return scheduleWithWarnings(tasks, members, deadline, today).tasks;
}

export function scheduleWithWarnings(
  tasks: Task[],
  members: Member[],
  deadline: string,
  today?: string,
): ScheduleResult {
  const warnings: string[] = [];
  const out = cleanDependencies(tasks.map((t) => ({ ...t })), warnings);
  const byTaskId = new Map(out.map((t) => [t.id, t]));
  const dependents = new Map<string, Task[]>(out.map((t) => [t.id, []]));
  for (const t of out) for (const d of t.dependsOn) dependents.get(d)!.push(t);

  const lastDue = addWorkingDays(deadline, -BUFFER_DAYS);
  const load = new Map(members.map((m) => [m.name, 0]));
  for (const t of out) if (isLocked(t)) load.set(t.owner!, (load.get(t.owner!) ?? 0) + t.estimateH);

  // Reverse topological order: every dependent is scheduled before the tasks it depends on.
  for (const id of topoOrder(out).reverse()) {
    const task = byTaskId.get(id)!;
    if (isLocked(task)) continue;

    let latest = lastDue;
    for (const dep of dependents.get(id)!) {
      if (dep.start && prevWorkingDay(dep.start) < latest) latest = prevWorkingDay(dep.start);
    }

    const owner = pickOwner(task, members, load, latest, warnings);
    if (!owner) {
      warnings.push(`No team member can take "${task.title}"; left unassigned.`);
      Object.assign(task, { owner: null, start: null, due: null });
      continue;
    }
    const { start, due } = datesFor(task, owner, latest);
    Object.assign(task, { owner: owner.name, start, due });
    load.set(owner.name, load.get(owner.name)! + task.estimateH);
  }

  if (today) startNoEarlierThan(today, out, members, lastDue, warnings);
  return { tasks: out, warnings };
}

/**
 * Forward repair for when the backward pass starts work before `today`: in dependency order, move
 * each such task to its owner's first free day on or after today (and after its dependencies),
 * keeping its length. Tasks can then run past the buffer; analyse() reports that as a risk.
 */
function startNoEarlierThan(today: string, tasks: Task[], members: Member[], lastDue: string, warnings: string[]) {
  if (!tasks.some((t) => !isLocked(t) && t.start && t.start < today)) return;
  const earliestPlanned = tasks.reduce((min, t) => (!isLocked(t) && t.start && t.start < min ? t.start : min), today);
  warnings.push(`This plan would need to start on ${earliestPlanned}, before today (${today}); tasks were moved forward.`);

  const byTaskId = new Map(tasks.map((t) => [t.id, t]));
  const membersByName = new Map(members.map((m) => [m.name, m]));
  for (const id of topoOrder(tasks)) {
    const t = byTaskId.get(id)!;
    if (isLocked(t) || !t.owner || !t.start || !t.due) continue;
    let earliest = isWeekday(today) ? today : addWorkingDays(today, 1);
    for (const d of t.dependsOn) {
      const due = byTaskId.get(d)!.due;
      if (due && addWorkingDays(due, 1) > earliest) earliest = addWorkingDays(due, 1);
    }
    if (t.start >= earliest) continue;

    const m = membersByName.get(t.owner)!;
    const blocked = new Set(m.blocked);
    const isFree = (d: string) => isWeekday(d) && !blocked.has(d);
    let start = earliest;
    while (!isFree(start)) start = addWorkingDays(start, 1);
    let due = start;
    for (let left = durationDays(t, m) - 1; left > 0; ) {
      due = addWorkingDays(due, 1);
      if (isFree(due)) left--;
    }
    Object.assign(t, { start, due });
  }

  const late = tasks.filter((t) => t.due && t.due > lastDue).sort(byId);
  if (late.length > 0) {
    warnings.push(`Not enough time: ${late.length} ${late.length === 1 ? "task is" : "tasks are"} due after ${lastDue}, inside the buffer or past the deadline.`);
  }
}

/** Tasks already started, finished or fully placed by the team are kept as they are. */
const isLocked = (t: Task) => t.status !== "todo" && t.owner !== null && t.start !== null && t.due !== null;

/** Working days a task needs from this member. Always at least 1. */
export function durationDays(task: Task, m: Member): number {
  const perDay = dailyHours(m);
  return perDay > 0 ? Math.max(1, Math.ceil(task.estimateH / perDay)) : 1;
}

/** Latest due on or before `latest` that is a free working day for `m`, and a start that fits the estimate. */
export function datesFor(task: Task, m: Member, latest: string): { start: string; due: string } {
  const blocked = new Set(m.blocked);
  const isFree = (d: string) => isWeekday(d) && !blocked.has(d);
  let due = latest;
  while (!isFree(due)) due = prevWorkingDay(due);
  let start = due;
  for (let left = durationDays(task, m) - 1; left > 0; ) {
    start = prevWorkingDay(start);
    if (isFree(start)) left--;
  }
  return { start, due };
}

function pickOwner(
  task: Task,
  members: Member[],
  load: Map<string, number>,
  latest: string,
  warnings: string[],
): Member | null {
  const working = members.filter((m) => m.hoursPerWeek > 0);
  if (working.length === 0) return null;

  let pool = working.filter((m) => task.requiredSkills.every((s) => m.skills.includes(s)));
  if (pool.length === 0) {
    warnings.push(`Nobody has every skill "${task.title}" needs (${task.requiredSkills.join(", ")}); assigned by load.`);
    pool = working;
  }

  // "Free" = not blocked anywhere in the window this member would need.
  const free = pool.filter((m) => {
    const start = addWorkingDays(latest, -(durationDays(task, m) - 1));
    return !isBlockedBetween(m, start, latest);
  });
  if (free.length > 0) pool = free;

  const ratio = (m: Member) => load.get(m.name)! / m.hoursPerWeek;
  return [...pool].sort((a, b) => ratio(a) - ratio(b) || a.name.localeCompare(b.name))[0];
}

/** Drops unknown and self dependencies, then breaks cycles. Each fix adds a warning. */
export function cleanDependencies(tasks: Task[], warnings: string[]): Task[] {
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    const kept = [...new Set(t.dependsOn)].filter((d) => {
      if (d === t.id) warnings.push(`"${t.title}" depended on itself; dependency removed.`);
      else if (!ids.has(d)) warnings.push(`"${t.title}" depended on unknown task ${d}; dependency removed.`);
      return d !== t.id && ids.has(d);
    });
    t.dependsOn = kept.sort((a, b) => byId({ id: a }, { id: b }));
  }

  // Kahn's algorithm. Whatever is left is in or behind a cycle: cut the first such task's
  // links to other leftover tasks and try again.
  for (;;) {
    const leftover = new Set(tasks.map((t) => t.id));
    for (const id of topoOrder(tasks, true)) leftover.delete(id);
    if (leftover.size === 0) return tasks;
    const victim = tasks.filter((t) => leftover.has(t.id)).sort(byId)[0];
    const cut = victim.dependsOn.filter((d) => leftover.has(d));
    victim.dependsOn = victim.dependsOn.filter((d) => !leftover.has(d));
    warnings.push(`Circular dependency involving "${victim.title}"; removed its link to ${cut.join(", ")}.`);
  }
}

/** Ids with dependencies first, ties by id. With `partial`, tasks in cycles are left out instead of throwing. */
export function topoOrder(tasks: Task[], partial = false): string[] {
  const indegree = new Map(tasks.map((t) => [t.id, t.dependsOn.length]));
  const dependents = new Map<string, string[]>(tasks.map((t) => [t.id, []]));
  for (const t of tasks) for (const d of t.dependsOn) dependents.get(d)?.push(t.id);

  const cmp = (a: string, b: string) => byId({ id: a }, { id: b });
  const ready = tasks.filter((t) => t.dependsOn.length === 0).map((t) => t.id).sort(cmp);
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const next of dependents.get(id)!) {
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) {
        ready.push(next);
        ready.sort(cmp);
      }
    }
  }
  if (!partial && order.length !== tasks.length) throw new Error("dependency cycle; run cleanDependencies first");
  return order;
}
