import { after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Task } from "../schemas";

// Fake Messages API that always answers with `reply`. llm.ts builds its client on import, so point it here first.
let reply: unknown;
let calls = 0;
let lastRequest: any;
const server = http.createServer((req, res) => {
  calls++;
  let body = "";
  req.on("data", (chunk) => (body += chunk)).on("end", () => {
    lastRequest = JSON.parse(body);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      id: "msg", type: "message", role: "assistant", model: "fake", stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(reply) }], usage: { input_tokens: 0, output_tokens: 0 },
    }));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
after(() => server.close());
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.ANTHROPIC_API_KEY = "test";
const { decompose } = await import("./decompose");

const brief = "Give a 10 minute “pitch” to the client.\nWrite a 2,500-word report.";
const rubric = "Presentation delivery 40%\nMarket analysis 60%";
const criteria = [{ id: "c1", name: "Presentation delivery", weight: 40 }, { id: "c2", name: "Market analysis", weight: 60 }];
const deliverables = [
  { id: "d1", title: "Pitch", criterionIds: ["c1"], sourceLine: "Give a 10 minute “pitch” to the client." },
  { id: "d2", title: "Report", criterionIds: ["c2"], sourceLine: "Write a 2,500-word report." },
];
// Five valid tasks in a chain (t2 needs t1, ...); `over[i]` replaces fields of task i.
const tasks = (over: Record<number, object> = {}) => ({
  tasks: [1, 2, 3, 4, 5].map((i) => ({
    id: `t${i}`, title: `Task ${i}`, criterionIds: ["c2"], estimateH: 4, confidence: "medium",
    dependsOn: i > 1 ? [`t${i - 1}`] : [], requiredSkills: ["writing"], sourceLine: "Write a 2,500-word report.", ...over[i],
  })),
});
const run = (r: unknown, sourceText = `${brief}\n${rubric}`) => {
  reply = r;
  calls = 0;
  return decompose(criteria, deliverables, sourceText);
};

test("asks for structured output and sends the criteria, deliverables and brief", async () => {
  await run(tasks());
  assert.equal(lastRequest.output_config.format.type, "json_schema");
  assert.deepEqual(lastRequest.output_config.format.schema.required, ["tasks"]);
  assert.match(lastRequest.messages[0].content, /DELIVERABLES:\n.*"d2"[\s\S]*BRIEF AND RUBRIC:\nGive a 10 minute/);
});

test("returns unscheduled todo tasks in the contract's Task shape", async () => {
  const out = await run(tasks());
  assert.equal(calls, 1);
  assert.deepEqual(out[1], {
    id: "t2", title: "Task 2", criterionIds: ["c2"], owner: null, estimateH: 4, confidence: "medium", start: null,
    due: null, dependsOn: ["t1"], status: "todo", requiredSkills: ["writing"], sourceLine: "Write a 2,500-word report.",
  });
  assert.equal(Task.array().parse(out).length, 5);
});

test("matches source lines ignoring case, spacing, quotes and dashes", async () => {
  await run(tasks({
    1: { sourceLine: ' give a 10  minute "pitch" to the client.' },
    2: { sourceLine: "Write a 2,500–word report." },
  }));
  assert.equal(calls, 1);
});

test("without the brief, source lines must come from the deliverables", async () => {
  reply = tasks();
  calls = 0;
  await decompose(criteria, deliverables);
  assert.equal(calls, 1);
  assert.doesNotMatch(lastRequest.messages[0].content, /BRIEF AND RUBRIC/);

  reply = tasks({ 1: { sourceLine: "Market analysis 60%" } }); // in the rubric, but the rubric was not given
  calls = 0;
  await assert.rejects(decompose(criteria, deliverables), /word for word/);
  assert.equal(calls, 2);
});

test("drops off-list skills and treats an unknown confidence as low instead of failing", async () => {
  const out = await run(tasks({ 1: { requiredSkills: ["Writing", "analysis", "data"], confidence: "very high" } }));
  assert.equal(calls, 1);
  assert.deepEqual(out[0].requiredSkills, ["writing", "data"]);
  assert.equal(out[0].confidence, "low");
});

test("rejects bad source lines, unknown criteria or dependencies, duplicate ids, cycles and bad sizes", async () => {
  const cases: [unknown, RegExp][] = [
    [tasks({ 1: { sourceLine: "Write a 5,000-word essay." } }), /task t1: sourceLine is not copied word for word/],
    [tasks({ 1: { sourceLine: "   " } }), /too_small/],
    [tasks({ 1: { criterionIds: ["c9"] } }), /task t1: unknown criterion "c9"/],
    [tasks({ 2: { dependsOn: ["t9"] } }), /task t2: unknown dependency "t9"/],
    [tasks({ 2: { id: "t1" } }), /must be unique/],
    [tasks({ 1: { dependsOn: ["t5"] } }), /cycle through task t1/],
    [tasks({ 3: { dependsOn: ["t3"] } }), /cycle through task t3/],
    [tasks({ 1: { estimateH: 0 } }), /too_small/],
    [{ tasks: tasks().tasks.slice(0, 4) }, /too_small/],
  ];
  for (const [r, error] of cases) {
    await assert.rejects(run(r), error);
    assert.equal(calls, 2); // the one retry also failed
  }
});
