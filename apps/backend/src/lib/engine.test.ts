// Role 2: engine tests (scheduler, analysis, replan) against the MK301 fixtures. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Member as MemberSchema, Task as TaskSchema, type Member, type Project, type Task } from "../schemas";
import { schedule, scheduleWithWarnings } from "./scheduler";
import { analyse } from "./analysis";
import { applyReplan, proposeReplan } from "./replan";
import { isWeekday } from "./dates";

const load = <T>(file: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
const project = load<Project>("project.json");
const rawTasks = load<Task[]>("tasks.json");
const DEADLINE = project.deadline; // 2026-11-06
const LAST_DUE = "2026-11-04"; // deadline minus the 2 working-day buffer
const SAM_SICK = { type: "unavailable", member: "Sam", from: "2026-10-20", to: "2026-10-24" } as const;

const member = (name: string, skills: Member["skills"], hoursPerWeek = 10, blocked: string[] = []): Member => ({
  name,
  hoursPerWeek,
  skills,
  blocked,
});

test("fixtures match the contract schemas", () => {
  for (const t of [...project.tasks, ...rawTasks]) TaskSchema.parse(t);
  for (const m of project.members) MemberSchema.parse(m);
});

// ---------- schedule ----------

test("schedule: same input gives identical output twice", () => {
  const a = scheduleWithWarnings(rawTasks, project.members, DEADLINE);
  const b = scheduleWithWarnings(structuredClone(rawTasks), structuredClone(project.members), DEADLINE);
  assert.deepEqual(a, b);
});

test("schedule: every task gets a skilled owner and valid working-day dates", () => {
  const tasks = schedule(rawTasks, project.members, DEADLINE);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    const owner = project.members.find((m) => m.name === t.owner);
    assert.ok(owner, `${t.id} has an owner`);
    assert.ok(t.requiredSkills.every((s) => owner.skills.includes(s)), `${t.id} owner has the skills`);
    assert.ok(t.start && t.due && t.start <= t.due, `${t.id} has start <= due`);
    assert.ok(isWeekday(t.start) && isWeekday(t.due), `${t.id} dates are weekdays`);
    assert.ok(t.due <= LAST_DUE, `${t.id} respects the buffer`);
    assert.ok(!owner.blocked.includes(t.due), `${t.id} isn't due on a blocked day`);
    for (const d of t.dependsOn) assert.ok(byId.get(d)!.due! < t.start, `${t.id} starts after ${d} is due`);
  }
});

test("schedule: does not mutate its input", () => {
  const copy = structuredClone(rawTasks);
  schedule(rawTasks, project.members, DEADLINE);
  assert.deepEqual(rawTasks, copy);
});

test("schedule: done and in-progress tasks keep their owner and dates", () => {
  const tasks = schedule(project.tasks, project.members, DEADLINE);
  for (const id of ["t1", "t2", "t3"]) {
    const before = project.tasks.find((t) => t.id === id)!;
    const after = tasks.find((t) => t.id === id)!;
    assert.deepEqual([after.owner, after.start, after.due], [before.owner, before.start, before.due]);
  }
});

test("schedule: one member gets everything", () => {
  const solo = [member("Solo", ["research", "writing", "data", "design", "presenting", "coding", "editing"], 40)];
  const { tasks } = scheduleWithWarnings(rawTasks, solo, DEADLINE);
  assert.ok(tasks.every((t) => t.owner === "Solo" && t.due !== null));
});

test("schedule: no skill match falls back to load and warns", () => {
  const team = [member("Ann", ["writing"]), member("Bo", ["writing"])];
  const task = { ...rawTasks[0], requiredSkills: ["coding"] } as Task;
  const { tasks, warnings } = scheduleWithWarnings([task], team, DEADLINE);
  assert.equal(tasks[0].owner, "Ann"); // tie on load, alphabetical
  assert.match(warnings[0], /Nobody has every skill/);
});

test("schedule: prefers a free member over a blocked one", () => {
  const task = { ...rawTasks[0], estimateH: 2 };
  const team = [member("Ann", ["research"], 10, [LAST_DUE]), member("Bo", ["research"])];
  assert.equal(schedule([task], team, DEADLINE)[0].owner, "Bo");
});

test("schedule: all members blocked still assigns, avoiding blocked days", () => {
  const task = { ...rawTasks[0], estimateH: 2 };
  const team = [member("Ann", ["research"], 10, [LAST_DUE]), member("Bo", ["research"], 10, [LAST_DUE])];
  const [t] = schedule([task], team, DEADLINE);
  assert.equal(t.owner, "Ann");
  assert.equal(t.due, "2026-11-03");
});

test("schedule: nobody with hours leaves the task unassigned with a warning", () => {
  const { tasks, warnings } = scheduleWithWarnings([rawTasks[0]], [member("Ann", ["research"], 0)], DEADLINE);
  assert.equal(tasks[0].owner, null);
  assert.match(warnings[0], /left unassigned/);
});

test("schedule: unknown, self and circular dependencies are removed with warnings", () => {
  const a = { ...rawTasks[0], id: "a", dependsOn: ["b", "ghost", "a"] };
  const b = { ...rawTasks[1], id: "b", dependsOn: ["a"] };
  const { tasks, warnings } = scheduleWithWarnings([a, b], project.members, DEADLINE);
  assert.ok(tasks.every((t) => t.due !== null));
  assert.equal(warnings.length, 3);
  assert.ok(warnings.some((w) => w.includes("ghost")));
  assert.ok(warnings.some((w) => w.includes("itself")));
  assert.ok(warnings.some((w) => w.includes("Circular")));
});

// ---------- analyse ----------

test("analyse: finds Mia's overload, the c4 gap and the low-slack rehearsal", () => {
  const { load, coverageGaps, risks } = analyse(project);
  assert.deepEqual(load.find((l) => l.member === "Mia"), { member: "Mia", plannedH: 14, availableH: 10.8 });
  assert.deepEqual(load.find((l) => l.member === "Alex"), { member: "Alex", plannedH: 13, availableH: 30.4 });
  assert.deepEqual(coverageGaps, [{ criterionId: "c4", name: "Critical evaluation of sources" }]);
  assert.deepEqual(risks.map((r) => r.type).sort(), ["low_slack", "over_capacity"]);
  assert.match(risks.find((r) => r.type === "over_capacity")!.detail, /^Mia/);
  assert.match(risks.find((r) => r.type === "low_slack")!.detail, /Rehearse presentation/);
});

test("analyse: flags unassigned tasks and broken dependency dates", () => {
  const tasks = project.tasks.map((t) =>
    t.id === "t20" ? { ...t, owner: null } : t.id === "t8" ? { ...t, start: "2026-10-21", due: "2026-10-22" } : t,
  );
  const types = analyse({ ...project, tasks }).risks.map((r) => r.type);
  assert.ok(types.includes("unassigned"));
  assert.ok(types.includes("dependency_conflict"));
});

// ---------- replan ----------

test("replan: Sam's absence gives a small, repeatable diff", () => {
  const a = proposeReplan(project, SAM_SICK);
  const b = proposeReplan(structuredClone(project), SAM_SICK);
  assert.deepEqual(a, b);
  assert.ok(a.changes.length <= 3, `diff is small (${a.changes.length} changes)`);
  assert.deepEqual(a.changes, [
    { taskId: "t4", field: "owner", from: "Sam", to: "Jo" },
    { taskId: "t7", field: "due", from: "2026-10-21", to: "2026-10-27" },
    { taskId: "t6", field: "owner", from: "Sam", to: "Jo" },
  ]);
  assert.deepEqual(a.warnings, []);
  assert.equal(
    a.explanation,
    'Sam is unavailable from 2026-10-20 to 2026-10-24, which affects 3 of their open tasks. "Analyse survey responses" and "Segment the target market" move to Jo; "Gather market size statistics" stays with Sam but is now due 2026-10-27 instead of 2026-10-21.',
  );
  assert.deepEqual(a.loadAfter, [
    { member: "Jo", plannedH: 21, availableH: 40 },
    { member: "Sam", plannedH: 12, availableH: 19.2 },
  ]);
});

test("replan: never touches locked tasks or other people's tasks", () => {
  const { changes } = proposeReplan(project, { ...SAM_SICK, from: "2026-10-12", to: "2026-11-06" });
  const touched = new Set(changes.map((c) => c.taskId));
  for (const t of project.tasks) {
    if (t.owner !== "Sam" || t.status !== "todo") assert.ok(!touched.has(t.id), `${t.id} untouched`);
  }
});

test("replan: absence that overlaps nothing changes nothing", () => {
  const r = proposeReplan(project, { ...SAM_SICK, from: "2026-11-05", to: "2026-11-06" });
  assert.deepEqual(r.changes, []);
  assert.match(r.explanation, /nothing needs to change/);
});

test("replan: in-progress task overlapping the absence stays and warns", () => {
  const r = proposeReplan(project, { ...SAM_SICK, from: "2026-10-15", to: "2026-10-16" });
  assert.ok(r.warnings.some((w) => w.includes("Collect survey responses")));
  assert.ok(!r.changes.some((c) => c.taskId === "t3"));
});

test("replan: unknown member or reversed dates return a warning, no changes", () => {
  assert.match(proposeReplan(project, { ...SAM_SICK, member: "Nobody" }).warnings[0], /no team member/);
  assert.match(proposeReplan(project, { ...SAM_SICK, from: "2026-10-24", to: "2026-10-20" }).warnings[0], /after it ends/);
});

test("replan: everyone else blocked means push, or warn if it can't move", () => {
  const blockAll = (m: Member) =>
    m.name === "Sam" ? m : { ...m, blocked: [...m.blocked, "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"] };
  const r = proposeReplan({ ...project, members: project.members.map(blockAll) }, SAM_SICK);
  assert.ok(r.changes.every((c) => c.field === "due"), "nobody to reassign to, so everything is pushed");

  const late = proposeReplan(
    { ...project, deadline: "2026-10-23", members: project.members.map(blockAll) },
    SAM_SICK,
  );
  assert.ok(late.warnings.some((w) => w.includes("the team needs to decide")));
});

test("replan: applyReplan writes the changes and blocks the days", () => {
  const { changes } = proposeReplan(project, SAM_SICK);
  const after = applyReplan(project, changes, SAM_SICK);
  assert.equal(after.tasks.find((t) => t.id === "t4")!.owner, "Jo");
  assert.equal(after.tasks.find((t) => t.id === "t7")!.due, "2026-10-27");
  assert.deepEqual(after.members.find((m) => m.name === "Sam")!.blocked, [
    "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23",
  ]);
  assert.deepEqual(proposeReplan(after, SAM_SICK).changes, [], "replanning again is a no-op");
  assert.equal(project.tasks.find((t) => t.id === "t4")!.owner, "Sam", "original untouched");
});

test("schedule: with today, nothing starts in the past and dependencies still hold", () => {
  const today = "2026-10-12";
  const { tasks, warnings } = scheduleWithWarnings(rawTasks, project.members, DEADLINE, today);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    assert.ok(t.start! >= today, `${t.id} starts ${t.start}`);
    for (const d of t.dependsOn) assert.ok(byId.get(d)!.due! < t.start!, `${t.id} starts after ${d} is due`);
  }
  assert.match(warnings[0], /before today \(2026-10-12\)/);
  assert.deepEqual(scheduleWithWarnings(rawTasks, project.members, DEADLINE, today), { tasks, warnings });
});
