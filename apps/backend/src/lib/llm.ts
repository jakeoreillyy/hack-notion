// Role 1: LLM wrapper returning validated JSON. Reads ANTHROPIC_API_KEY and ANTHROPIC_MODEL from .env.
import Anthropic from "@anthropic-ai/sdk";
import type { ZodType } from "zod";

const client = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  return JSON.parse(body.slice(start, end + 1));
}

/** Sends the prompt, parses the JSON reply and validates it. Retries once, telling the model what was wrong. */
export async function callJson<T>(prompt: string, schema: ZodType<T>, system?: string): Promise<T> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: `${system ?? ""}\nRespond with a single JSON value only. No prose, no markdown.`.trim(),
      messages,
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

    try {
      const parsed = schema.safeParse(extractJson(text));
      if (parsed.success) return parsed.data;
      lastError = parsed.error.message;
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
