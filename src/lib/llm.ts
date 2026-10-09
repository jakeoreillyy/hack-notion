// Role 1: one provider SDK wrapped to return validated JSON. Key in LLM_API_KEY.
import type { ZodType } from "zod";

export async function callJson<T>(_prompt: string, _schema: ZodType<T>): Promise<T> {
  // TODO(Role 1): call the provider, parse the response, validate with the schema, retry once.
  throw new Error("llm.callJson not implemented");
}
