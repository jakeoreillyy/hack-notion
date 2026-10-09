// Role 2: proposeReplan(project, change) -> { changes, loadAfter, explanation, warnings }
// Pure: no I/O, no clock. Nothing is applied here; applyReplan() does that once the team confirms.
//
// Only the absent member's open tasks that overlap the absence are touched. Done and in-progress
// tasks, and everyone else's tasks, are never edited. For each affected task, in start order:
//   1. Reassign to a member with the skills who isn't blocked in the task's window, has enough free
//      hours in that window, and stays within capacity (lowest load, then alphabetical).
//   2. Otherwise push: keep the owner and extend the due date until they get back the working days
//      they lost, as long as it stays on or before the deadline.
//   3. Otherwise give it to a skilled, unblocked member even if that overloads them, with a warning.
import type { Change, Load, Member, Project, Task } from "../schemas";
import { computeLoad } from "./analysis";
import { BUFFER_DAYS } from "./scheduler";
import { addDays, addWorkingDays, byId, dailyHours, freeDays, isBlockedBetween, isWeekday, weekdaysBetween } from "./dates";

export type Unavailable = { type: "unavailable"; member: string; from: string; to: string };
export type ReplanResult = { changes: Change[]; loadAfter: Load[]; explanation: string; warnings: string[] };

type ReplanInput = Pick<Project, "members" | "tasks" | "deadline">;

export function proposeReplan(project: ReplanInput, change: Unavailable): ReplanResult {
  const { name, from, to } = { name: change.member, from: change.from, to: change.to };
  const warnings: string[] = [];
  const absent = project.members.find((m) => m.name === name);
  if (!absent) return empty(`There is no team member called ${name}.`, warnings);
  if (from > to) return empty(`The absence starts (${from}) after it ends (${to}).`, warnings);

  const members = withAbsence(project.members, change);
  const absentAfter = members.find((m) => m.name === name)!;
  const tasks = project.tasks.map((t) => ({ ...t }));
  const lastDue = addWorkingDays(project.deadline, -BUFFER_DAYS);

  // A task is affected only if the absence removes working days its owner had in the task's window,
  // so reporting the same absence twice changes nothing the second time.
  const overlapping = tasks.filter(
    (t) =>
      t.owner === name &&
      t.start &&
      t.due &&
      freeDays(absentAfter, t.start, t.due).length < freeDays(absent, t.start, t.due).length,
  );
  for (const t of overlapping.filter((t) => t.status === "doing").sort(byId)) {
    warnings.push(`"${t.title}" is already in progress, so it stays with ${name} even though it overlaps the absence.`);
  }
  const affected = overlapping
    .filter((t) => t.status === "todo")
    .sort((a, b) => a.start!.localeCompare(b.start!) || byId(a, b));

  const changes: Change[] = [];
  const moved: { task: Task; to: string }[] = [];
  const pushed: { task: Task; from: string }[] = [];
  const stuck: Task[] = [];

  for (const task of affected) {
    const loadNow = computeLoad(members, tasks, project.deadline);
    const skilled = members.filter(
      (m) =>
        m.name !== name &&
        m.hoursPerWeek > 0 &&
        task.requiredSkills.every((s) => m.skills.includes(s)) &&
        !isBlockedBetween(m, task.start!, task.due!),
    );
    const fits = skilled.filter((m) => {
      const l = loadNow.find((x) => x.member === m.name)!;
      return freeHoursInWindow(m, task, tasks) >= task.estimateH && l.plannedH + task.estimateH <= l.availableH;
    });

    const best = lowestLoad(fits, loadNow);
    if (best) {
      reassign(task, best, changes, moved);
      continue;
    }

    const newDue = extendedDue(task, absent, absentAfter);
    if (newDue <= project.deadline) {
      changes.push({ taskId: task.id, field: "due", from: task.due, to: newDue });
      pushed.push({ task, from: task.due! });
      if (newDue > lastDue) warnings.push(`"${task.title}" is now due ${newDue}, inside the 2-day buffer before the deadline.`);
      for (const dep of tasks.filter((t) => t.dependsOn.includes(task.id) && t.status !== "done" && t.start && t.start <= newDue).sort(byId)) {
        warnings.push(`"${dep.title}" starts ${dep.start}, before "${task.title}" is now due (${newDue}).`);
      }
      task.due = newDue;
      continue;
    }

    const fallback = lowestLoad(skilled, loadNow);
    if (fallback) {
      warnings.push(`Nobody has spare time for "${task.title}"; giving it to ${fallback.name} puts them over capacity.`);
      reassign(task, fallback, changes, moved);
    } else {
      warnings.push(`Nobody can cover "${task.title}" and it can't move before the deadline; the team needs to decide.`);
      stuck.push(task);
    }
  }

  // loadAfter lists only members whose numbers changed.
  const before = computeLoad(project.members, project.tasks, project.deadline);
  const loadAfter = computeLoad(members, tasks, project.deadline).filter((l) => {
    const b = before.find((x) => x.member === l.member)!;
    return b.plannedH !== l.plannedH || b.availableH !== l.availableH;
  });

  return { changes, loadAfter, explanation: explain(change, affected.length, moved, pushed, stuck), warnings };
}

/** Applies a confirmed proposal: the absence becomes blocked days and the changes are written to tasks. */
export function applyReplan<P extends ReplanInput>(project: P, changes: Change[], change: Unavailable): P {
  const tasks = project.tasks.map((t) => {
    const updated = { ...t };
    for (const c of changes) if (c.taskId === t.id) updated[c.field] = c.to;
    return updated;
  });
  return { ...project, members: withAbsence(project.members, change), tasks };
}

function withAbsence(members: Member[], change: Unavailable): Member[] {
  return members.map((m) =>
    m.name === change.member
      ? { ...m, blocked: [...new Set([...m.blocked, ...weekdaysBetween(change.from, change.to)])].sort() }
      : m,
  );
}

function reassign(task: Task, to: Member, changes: Change[], moved: { task: Task; to: string }[]) {
  changes.push({ taskId: task.id, field: "owner", from: task.owner, to: to.name });
  moved.push({ task, to: to.name });
  task.owner = to.name;
}

function lowestLoad(pool: Member[], load: Load[]): Member | undefined {
  const ratio = (m: Member) => load.find((l) => l.member === m.name)!.plannedH / m.hoursPerWeek;
  return [...pool].sort((a, b) => ratio(a) - ratio(b) || a.name.localeCompare(b.name))[0];
}

/**
 * Hours `m` can give `task` inside its window: daily hours x free days, minus a pro-rata share of
 * their other open tasks that overlap the window.
 */
function freeHoursInWindow(m: Member, task: Task, tasks: Task[]): number {
  const window = freeDays(m, task.start!, task.due!);
  let committed = 0;
  for (const t of tasks) {
    if (t.owner !== m.name || t.id === task.id || t.status === "done" || !t.start || !t.due) continue;
    const days = freeDays(m, t.start, t.due);
    const overlap = days.filter((d) => window.includes(d)).length;
    committed += (t.estimateH * overlap) / Math.max(1, days.length);
  }
  return dailyHours(m) * window.length - committed;
}

/** Extends the due date until the owner has as many free working days in the window as before. */
function extendedDue(task: Task, before: Member, after: Member): string {
  const needed = Math.max(1, freeDays(before, task.start!, task.due!).length);
  const blocked = new Set(after.blocked);
  let have = freeDays(after, task.start!, task.due!).length;
  let due = task.due!;
  while (have < needed) {
    due = addDays(due, 1);
    if (isWeekday(due) && !blocked.has(due)) have++;
  }
  return due;
}

function empty(warning: string, warnings: string[]): ReplanResult {
  return { changes: [], loadAfter: [], explanation: warning, warnings: [...warnings, warning] };
}

// Template only: every fact in the explanation comes from the changes above.
function explain(
  change: Unavailable,
  affectedCount: number,
  moved: { task: Task; to: string }[],
  pushed: { task: Task; from: string }[],
  stuck: Task[],
): string {
  const who = change.member;
  const when = `from ${change.from} to ${change.to}`;
  if (affectedCount === 0) {
    return `${who} is unavailable ${when}, but none of their open tasks fall in that window, so nothing needs to change.`;
  }
  const first = `${who} is unavailable ${when}, which affects ${affectedCount} of their open ${affectedCount === 1 ? "task" : "tasks"}.`;

  const parts: string[] = [];
  const recipients = [...new Set(moved.map((m) => m.to))];
  for (const r of recipients) {
    const titles = moved.filter((m) => m.to === r).map((m) => `"${m.task.title}"`);
    parts.push(`${list(titles)} ${titles.length === 1 ? "moves" : "move"} to ${r}`);
  }
  for (const p of pushed) parts.push(`"${p.task.title}" stays with ${who} but is now due ${p.task.due} instead of ${p.from}`);
  if (stuck.length > 0) parts.push(`${list(stuck.map((t) => `"${t.title}"`))} could not be covered`);

  const second = parts.join("; ");
  return `${first} ${second.charAt(0).toUpperCase()}${second.slice(1)}.`;
}

const list = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
