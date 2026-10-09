// Role 1: LLM wrapper returning validated JSON. Reads ANTHROPIC_API_KEY and ANTHROPIC_MODEL from .env.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

/**
 * Sends the prompt and returns the reply validated against `schema`. Structured outputs make the API return JSON
 * of the schema's shape; checks it cannot express (refinements, lengths) get one retry with the error fed back.
 */
export async function callJson<T>(prompt: string, schema: ZodType<T>, system?: string): Promise<T> {
  const format = zodOutputFormat(schema);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({ model: MODEL, max_tokens: 16000, system, messages, output_config: { format } });
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
