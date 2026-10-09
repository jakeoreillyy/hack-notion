import { after, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Fake Messages API that always fails with `status`. llm.ts builds its client on import, so point it here first.
let status = 400;
let calls = 0;
const server = http.createServer((req, res) => {
  calls++;
  req.resume().on("end", () => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.setHeader("retry-after-ms", "1"); // keep the SDK's retry backoff short
    res.end(JSON.stringify({ type: "error", error: { type: "some_error", message: "bad max_tokens" } }));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
after(() => server.close());
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
process.env.ANTHROPIC_API_KEY = "test";
const { callJson } = await import("./llm");

const failWith = async (s: number) => {
  status = s;
  calls = 0;
  const err = await callJson("hi", z.object({ a: z.string() })).then(
    () => assert.fail("expected callJson to reject"),
    (e: Error) => e,
  );
  return { err, calls };
};

test("explains an auth failure without retrying, keeping the SDK error as cause", async () => {
  const { err, calls } = await failWith(401);
  assert.match(err.message, /ANTHROPIC_API_KEY/);
  assert.ok(err.cause instanceof Anthropic.AuthenticationError);
  assert.equal(calls, 1);
});

test("retries a rate limit before giving up", async () => {
  const { err, calls } = await failWith(429);
  assert.match(err.message, /rate limit/);
  assert.equal(calls, 5);
});

test("reports other API errors with the status once and the API's message", async () => {
  const { err, calls } = await failWith(400);
  assert.match(err.message, /^LLM API error 400 \{.*bad max_tokens/);
  assert.equal((err.cause as InstanceType<typeof Anthropic.APIError>).status, 400);
  assert.equal(calls, 1);
});
