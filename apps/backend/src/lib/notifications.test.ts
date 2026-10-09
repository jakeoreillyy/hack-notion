import { test } from "node:test";
import assert from "node:assert/strict";
import { findNotifications } from "./notifications";
import type { Task } from "../schemas";

const base: Task = {
  id: "t1", title: "Collect data", criterionIds: ["c1"], owner: "Alex", estimateH: 4, confidence: "medium",
  start: "2026-10-12", due: "2026-10-16", dependsOn: [], status: "todo", requiredSkills: ["research"], sourceLine: "x",
};

test("notifies within 2 days, on the day, and when overdue", () => {
  assert.equal(findNotifications([base], "2026-10-14")[0].daysLeft, 2);
  assert.equal(findNotifications([base], "2026-10-16")[0].daysLeft, 0);
  assert.equal(findNotifications([base], "2026-10-18")[0].daysLeft, -2);
});

test("does not notify when more than 2 days away", () => {
  assert.equal(findNotifications([base], "2026-10-13").length, 0);
});

test("skips done tasks, unowned tasks and tasks without a due date", () => {
  assert.equal(findNotifications([{ ...base, status: "done" }], "2026-10-16").length, 0);
  assert.equal(findNotifications([{ ...base, owner: null }], "2026-10-16").length, 0);
  assert.equal(findNotifications([{ ...base, due: null }], "2026-10-16").length, 0);
});

test("started tasks omit the 'not been started' text", () => {
  assert.ok(!findNotifications([{ ...base, status: "doing" }], "2026-10-16")[0].message.includes("not been started"));
});
