// Role 1: LLM wrapper returning validated JSON. Reads ANTHROPIC_API_KEY and ANTHROPIC_MODEL from .env.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";

// The SDK retries rate limits, 5xx, network errors and timeouts with backoff.
const client = new Anthropic({ maxRetries: 4, timeout: 120_000 });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

// Readable message for SDK errors; the original stays as `cause` (status, request id) for callers that need it.
function describeApiError(e: unknown): unknown {
  const wrap = (message: string) => new Error(message, { cause: e });
  if (e instanceof Anthropic.AuthenticationError) return wrap("LLM auth failed: check ANTHROPIC_API_KEY in apps/backend/.env");
  if (e instanceof Anthropic.RateLimitError) return wrap("LLM rate limit hit, try again in a minute");
  // Also covers timeouts (APIConnectionTimeoutError is a subclass).
  if (e instanceof Anthropic.APIConnectionError) return wrap("Could not reach the LLM API (network error or timeout)");
  // The SDK's message already starts with the status code.
  if (e instanceof Anthropic.APIError) return wrap(`LLM API error ${e.message}`);
  return e;
}

/**
 * Sends the prompt and returns the reply validated against `schema`. Structured outputs make the API return JSON
 * of the schema's shape; checks it cannot express (refinements, lengths) get one retry with the error fed back.
 */
export async function callJson<T>(prompt: string, schema: ZodType<T>, system?: string): Promise<T> {
  const format = zodOutputFormat(schema);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages
      .create({ model: MODEL, max_tokens: 16000, system, messages, output_config: { format } })
      .catch((e) => {
        throw describeApiError(e);
      });
    // A refusal or a cut-off reply would fail the same way again, so don't spend the retry on it.
    if (res.stop_reason !== "end_turn") throw new Error(`callJson: model stopped with "${res.stop_reason}"`);
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

    try {
      return format.parse(text);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    messages.push(
      { role: "assistant", content: text },
      { role: "user", content: `That reply was invalid: ${lastError}\nReturn corrected JSON only.` },
    );
  }
  throw new Error(`callJson failed after retry: ${lastError}`);
}
