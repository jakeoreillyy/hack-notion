import { after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// Fake Messages API that always answers with `reply`. llm.ts builds its client on import, so point it here first.
let reply: unknown;
let stopReason = "end_turn";
let calls = 0;
let lastRequest: any;
const server = http.createServer((req, res) => {
  calls++;
  let body = "";
  req.on("data", (chunk) => (body += chunk)).on("end", () => {
    lastRequest = JSON.parse(body);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      id: "msg", type: "message", role: "assistant", model: "fake", stop_reason: stopReason, stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(reply) }], usage: { input_tokens: 0, output_tokens: 0 },
    }));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
after(() => server.close());
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.ANTHROPIC_API_KEY = "test";
const { extractBrief } = await import("./extract");

const brief = "Write a 2,500-word report.\nGive a 10 minute “pitch” to the client.";
const rubric = "Market analysis 25%\nPresentation delivery 15%";
const criteria = [{ name: "Market analysis", weight: 25 }, { name: "Presentation delivery", weight: 15 }];
const report = { title: "Report", criteria: ["Market analysis"], sourceLine: "Write a 2,500-word report." };
const run = (r: unknown, stop = "end_turn") => {
  reply = r;
  stopReason = stop;
  calls = 0;
  return extractBrief(brief, rubric);
};

test("asks the API for structured output in the extraction schema's shape", async () => {
  await run({ criteria, deliverables: [report] });
  assert.equal(lastRequest.output_config.format.type, "json_schema");
  assert.deepEqual(lastRequest.output_config.format.schema.required, ["criteria", "deliverables"]);
});

test("fails fast, without a retry, when the model refuses or is cut off", async () => {
  for (const stop of ["refusal", "max_tokens"]) {
    await assert.rejects(run({ criteria, deliverables: [report] }, stop), new RegExp(stop));
    assert.equal(calls, 1);
  }
});

test("maps criterion names to ids and keeps the rubric's weights", async () => {
  assert.deepEqual(await run({ criteria, deliverables: [report] }), {
    criteria: [{ id: "c1", name: "Market analysis", weight: 25 }, { id: "c2", name: "Presentation delivery", weight: 15 }],
    deliverables: [{ id: "d1", title: "Report", criterionIds: ["c1"], sourceLine: "Write a 2,500-word report." }],
  });
});

test("rounds weights to 1 decimal and shares 100 equally when any is missing or all are 0", async () => {
  const weights = async (w: (number | null)[]) => {
    const out = await run({ criteria: w.map((weight, i) => ({ name: `C${i}`, weight })), deliverables: [{ ...report, criteria: [] }] });
    return out.criteria.map((c) => c.weight);
  };
  assert.deepEqual(await weights([33.333, 66.667]), [33.3, 66.7]);
  assert.deepEqual(await weights([25, null, 10]), [33.3, 33.3, 33.3]);
  assert.deepEqual(await weights([0, 0]), [50, 50]);
});

test("matches source lines and criterion names ignoring case, spacing, quotes and dashes", async () => {
  const out = await run({
    criteria: [{ name: "Presentation delivery ", weight: null }],
    deliverables: [
      { title: "Pitch", criteria: ["presentation  delivery", "Presentation delivery"], sourceLine: ' give a 10  minute "pitch" to the client.' },
      { ...report, criteria: [], sourceLine: "Write a 2,500–word report." },
    ],
  });
  assert.equal(calls, 1);
  assert.equal(out.criteria[0].name, "Presentation delivery");
  assert.deepEqual(out.deliverables[0].criterionIds, ["c1"]);
});

test("rejects invented or blank source lines, unknown or duplicate criteria and weights over 100", async () => {
  const cases: [unknown, RegExp][] = [
    [{ criteria, deliverables: [{ ...report, sourceLine: "Write a 5,000-word essay." }] }, /word for word/],
    [{ criteria, deliverables: [{ ...report, sourceLine: "   " }] }, /too_small/],
    [{ criteria, deliverables: [{ ...report, criteria: ["Teamwork"] }] }, /unknown criterion .*Teamwork/],
    [{ criteria: [...criteria, { name: "market analysis", weight: 5 }], deliverables: [report] }, /must be unique/],
    [{ criteria: [{ ...criteria[0], weight: 150 }], deliverables: [report] }, /too_big/],
  ];
  for (const [r, error] of cases) {
    await assert.rejects(run(r), error);
    assert.equal(calls, 2); // the one retry also failed
  }
});

test("rejects an empty brief or rubric without calling the model", async () => {
  calls = 0;
  await assert.rejects(extractBrief(brief, " \n"), /must not be empty/);
  await assert.rejects(extractBrief("", rubric), /must not be empty/);
  assert.equal(calls, 0);
});
