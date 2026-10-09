// Role 2: endpoint tests. Each test gets its own app on a random port with an in-memory store.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { PlanView, ReplanProposal } from "../schemas";
import { createApp, DEMO_PROJECT_ID } from "../app";
import { fallbackDeps, type Deps } from "../lib/integrations";
import { createStore } from "../lib/store";

const TODAY = "2026-10-19";
const SAM_SICK = { change: { type: "unavailable", member: "Sam", from: "2026-10-20", to: "2026-10-24" } };
const NEW_PROJECT = {
  brief: "MK301 brief text",
  rubric: "MK301 rubric text",
  deadline: "2026-11-06",
  members: [
    { name: "Alex", hoursPerWeek: 10, skills: ["research", "writing"], blocked: [] },
    { name: "Jo", hoursPerWeek: 10, skills: ["research", "data", "writing", "presenting", "design"], blocked: [] },
    { name: "Mia", hoursPerWeek: 10, skills: ["editing", "writing"], blocked: [] },
  ],
};

async function withApp(fn: (call: Call) => Promise<void>, overrides: Partial<Deps> = {}) {
  const deps: Deps = { ...fallbackDeps, today: () => TODAY, fallbacks: ["extractBrief", "decompose"], ...overrides };
  const server = createApp(createStore(null), deps).listen(0);
  const base = `http://localhost:${(server.address() as AddressInfo).port}/api/projects`;
  const call: Call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    await fn(call);
  } finally {
    server.close();
  }
}
type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>;

const demo = `/${DEMO_PROJECT_ID}`;

test("GET demo project returns a valid PlanView", () =>
  withApp(async (call) => {
    const { status, body } = await call("GET", demo);
    assert.equal(status, 200);
    PlanView.parse(body);
    assert.equal(body.tasks.length, 21);
    assert.deepEqual(body.coverageGaps, [{ criterionId: "c4", name: "Critical evaluation of sources" }]);
  }));

test("unknown project and unknown route return { error, warnings }", () =>
  withApp(async (call) => {
    assert.deepEqual(await call("GET", "/p_nope"), { status: 404, body: { error: "No project with id p_nope.", warnings: [] } });
    assert.equal((await call("GET", "/x/y/z")).status, 404);
  }));

test("POST creates a scheduled draft (fixture fallback) with a warning", () =>
  withApp(async (call) => {
    const { status, body } = await call("POST", "", NEW_PROJECT);
    assert.equal(status, 201);
    PlanView.parse(body);
    assert.equal(body.state, "draft");
    assert.equal(body.projectId, "p_1");
    assert.ok(body.tasks.every((t: any) => t.owner && t.start >= TODAY && t.due));
    assert.match(body.warnings[0], /demo plan/);
    assert.equal((await call("GET", "/p_1")).body.tasks.length, body.tasks.length, "stored");
  }));

test("POST validates the request", () =>
  withApp(async (call) => {
    const bad = await call("POST", "", { ...NEW_PROJECT, deadline: "6 Nov" });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /deadline/);
    assert.deepEqual(bad.body.warnings, []);

    const dupes = await call("POST", "", { ...NEW_PROJECT, members: [NEW_PROJECT.members[0], NEW_PROJECT.members[0]] });
    assert.equal(dupes.status, 400);
    assert.equal((await call("POST", "", { ...NEW_PROJECT, deadline: "2026-10-01" })).status, 400);
  }));

test("POST drops tasks without a sourceLine and returns 502 when Role 1 fails", async () => {
  await withApp(
    async (call) => {
      const { body } = await call("POST", "", NEW_PROJECT);
      assert.equal(body.tasks.length, 20);
      assert.ok(body.warnings.some((w: string) => w.startsWith("Dropped a task")));
    },
    {
      async decompose(...args) {
        const tasks = await fallbackDeps.decompose(...args);
        return [{ ...tasks[0], sourceLine: "" }, ...tasks.slice(1)];
      },
    },
  );
  await withApp(
    async (call) => {
      const { status, body } = await call("POST", "", NEW_PROJECT);
      assert.equal(status, 502);
      assert.match(body.error, /LLM timed out/);
    },
    { extractBrief: () => Promise.reject(new Error("LLM timed out")) },
  );
});

test("PUT plan reruns analysis and warns about unknown owners", () =>
  withApp(async (call) => {
    const { body: plan } = await call("GET", demo);
    const tasks = plan.tasks.map((t: any) => (t.id === "t20" ? { ...t, owner: "Zed", criterionIds: ["c6", "c4"] } : t));
    const { status, body } = await call("PUT", `${demo}/plan`, { tasks });
    assert.equal(status, 200);
    assert.deepEqual(body.coverageGaps, [], "c4 now covered");
    assert.match(body.warnings[0], /Zed/);
  }));

test("confirm still confirms when Notion fails, and stores the URL when it works", async () => {
  await withApp(async (call) => {
    const { body } = await call("POST", `${demo}/confirm`);
    assert.equal(body.state, "confirmed");
    assert.equal(body.notionUrl, null);
    assert.match(body.warnings[0], /Notion workspace wasn't created/);
  });
  await withApp(
    async (call) => {
      assert.equal((await call("POST", `${demo}/confirm`)).body.notionUrl, "https://notion.so/mk301");
      assert.equal((await call("GET", demo)).body.notionUrl, "https://notion.so/mk301");
    },
    { createWorkspace: async () => "https://notion.so/mk301" },
  );
});

test("PATCH task status updates it and mirrors to Notion", () => {
  const synced: string[] = [];
  return withApp(
    async (call) => {
      await call("POST", `${demo}/confirm`);
      const { body } = await call("PATCH", `${demo}/tasks/t4`, { status: "doing" });
      assert.equal(body.tasks.find((t: any) => t.id === "t4").status, "doing");
      assert.deepEqual(synced, ["t4:doing"]);
      assert.equal((await call("PATCH", `${demo}/tasks/t99`, { status: "doing" })).status, 404);
      assert.equal((await call("PATCH", `${demo}/tasks/t4`, { status: "finished" })).status, 400);
    },
    {
      createWorkspace: async () => "https://notion.so/mk301",
      updateTaskStatus: async (_p, id, s) => void synced.push(`${id}:${s}`),
    },
  );
});

test("notifications use ?today= and the 2-day rule", () =>
  withApp(async (call) => {
    const { body } = await call("GET", `${demo}/notifications?today=2026-10-20`);
    assert.deepEqual(body.warnings, []);
    assert.deepEqual(body.notifications.map((n: any) => n.taskId), ["t3", "t5", "t10", "t7", "t4"]);
    assert.equal(body.notifications[0].message, "'Collect survey responses' is 4 days overdue.");
    assert.equal(body.notifications[3].message, "'Gather market size statistics' is due in 1 day and hasn't been started.");
    assert.equal((await call("GET", `${demo}/notifications?today=tomorrow`)).status, 400);
  }));

test("replan proposes without changing anything, confirm applies it", () => {
  const applied: unknown[] = [];
  return withApp(
    async (call) => {
      await call("POST", `${demo}/confirm`);
      const { body: proposal } = await call("POST", `${demo}/replan`, SAM_SICK);
      ReplanProposal.parse(proposal);
      assert.equal(proposal.proposalId, "pr_1");
      assert.equal(proposal.changes.length, 3);
      assert.equal((await call("GET", demo)).body.tasks.find((t: any) => t.id === "t4").owner, "Sam", "not applied yet");

      const { status, body } = await call("POST", `${demo}/replan/confirm`, { proposalId: "pr_1" });
      assert.equal(status, 200);
      assert.equal(body.tasks.find((t: any) => t.id === "t4").owner, "Jo");
      assert.equal(body.tasks.find((t: any) => t.id === "t7").due, "2026-10-27");
      assert.equal(applied.length, 1, "mirrored to Notion");
      assert.equal((await call("POST", `${demo}/replan/confirm`, { proposalId: "pr_1" })).status, 404, "used up");
    },
    { createWorkspace: async () => "https://notion.so/mk301", applyChanges: async (_p, c) => void applied.push(c) },
  );
});

test("replan confirm refuses a stale proposal", () =>
  withApp(async (call) => {
    const { body: proposal } = await call("POST", `${demo}/replan`, SAM_SICK);
    await call("PATCH", `${demo}/tasks/t3`, { status: "done" }); // unrelated edit: still fine
    const { body: plan } = await call("GET", demo);
    // Someone hands t4 to Alex by hand before the proposal is confirmed.
    const { body: second } = await call("POST", `${demo}/replan`, SAM_SICK);
    const tasks = plan.tasks.map((t: any) => (t.id === "t4" ? { ...t, owner: "Alex" } : t));
    await call("PUT", `${demo}/plan`, { tasks });
    assert.equal((await call("POST", `${demo}/replan/confirm`, { proposalId: second.proposalId })).status, 404, "edits clear proposals");

    const { body: third } = await call("POST", `${demo}/replan`, SAM_SICK);
    assert.ok(!third.changes.some((c: any) => c.taskId === "t4"), "t4 is Alex's now");
    assert.notEqual(proposal.proposalId, third.proposalId);
  }));

test("replan validates input and unknown members come back as warnings", () =>
  withApp(async (call) => {
    assert.equal((await call("POST", `${demo}/replan`, { change: { type: "sick", member: "Sam" } })).status, 400);
    const { status, body } = await call("POST", `${demo}/replan`, { change: { ...SAM_SICK.change, member: "Nobody" } });
    assert.equal(status, 200);
    assert.deepEqual(body.changes, []);
    assert.match(body.warnings[0], /no team member/);
  }));

test("malformed JSON returns 400 in the error shape", () =>
  withApp(async () => {
    const deps: Deps = { ...fallbackDeps, today: () => TODAY, fallbacks: [] };
    const server = createApp(createStore(null), deps).listen(0);
    try {
      const res = await fetch(`http://localhost:${(server.address() as AddressInfo).port}/api/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      });
      assert.equal(res.status, 400);
      assert.deepEqual(Object.keys(await res.json()), ["error", "warnings"]);
    } finally {
      server.close();
    }
  }));

test("handoff assumptions: grid edits, members in load, null owners, refresh", () =>
  withApp(async (call) => {
    const { body: plan } = await call("GET", demo);
    const available = Object.fromEntries(plan.load.map((l: any) => [l.member, l.availableH]));

    // Grid move: t8 to an earlier week (Monday..Friday), t11 into the same week as t8, t20 unassigned.
    const tasks = plan.tasks.map((t: any) =>
      t.id === "t8" ? { ...t, start: "2026-10-05", due: "2026-10-09" }
      : t.id === "t20" ? { ...t, owner: null }
      : t,
    );
    const { body } = await call("PUT", `${demo}/plan`, { tasks });
    assert.deepEqual(Object.fromEntries(body.load.map((l: any) => [l.member, l.availableH])), available, "availableH unchanged");
    assert.deepEqual(body.load.map((l: any) => l.member), ["Alex", "Jo", "Mia", "Ravi", "Sam"], "every member in load");
    assert.equal(body.tasks.find((t: any) => t.id === "t20").owner, null);
    assert.ok(body.risks.some((r: any) => r.type === "unassigned"));

    const sameWeek = plan.tasks.map((t: any) =>
      t.id === "t8" || t.id === "t9" ? { ...t, start: "2026-10-26", due: "2026-10-30" } : t,
    );
    const { body: grid } = await call("PUT", `${demo}/plan`, { tasks: sameWeek });
    assert.ok(!grid.risks.some((r: any) => r.type === "dependency_conflict"), "t9 depends on t8 in the same week: fine");

    const empty = await call("POST", "", { ...NEW_PROJECT, members: [...NEW_PROJECT.members, { name: "Zoe", hoursPerWeek: 2, skills: ["coding"], blocked: [] }] });
    assert.ok(empty.body.load.some((l: any) => l.member === "Zoe" && l.plannedH === 0), "0-hour member still listed");

    await call("POST", `${demo}/confirm`);
    assert.equal((await call("GET", demo)).body.state, "confirmed", "refresh sees confirmed");
  }));
