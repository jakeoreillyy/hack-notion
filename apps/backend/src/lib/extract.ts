// Role 1: brief + rubric -> criteria and deliverables.
import { z } from "zod";
import { callJson } from "./llm";
import type { Criterion, Deliverable } from "../schemas";

const SYSTEM = `You read a university group-project brief and its marking rubric.
Return JSON: {"criteria":[{"name":string,"weight":number|null}],"deliverables":[{"title":string,"criteria":[string],"sourceLine":string}]}
- criteria: one entry per rubric criterion, named as in the rubric. weight is its percentage of the total mark (convert marks or fractions to a percentage), or null if the rubric gives none.
- deliverables: the things the team must hand in or do (report, presentation, prototype...). "criteria" lists the names of the criteria that deliverable earns marks under. Every name must match a criteria name exactly.
- sourceLine: a full sentence copied word for word from the brief or rubric that justifies the deliverable. Never paraphrase or shorten it.
- Do not invent criteria or deliverables that the text does not support.`;

// For matching source lines and criterion names: ignore case, spacing, PDF ligatures and curly quotes/dashes.
export const norm = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const text = z.string().trim().min(1);

export async function extractBrief(
  brief: string,
  rubric: string,
): Promise<{ criteria: Criterion[]; deliverables: Deliverable[] }> {
  if (!brief.trim() || !rubric.trim()) throw new Error("Brief and rubric must not be empty");
  const source = norm(`${brief}\n${rubric}`);

  const schema = z
    .object({
      criteria: z.array(z.object({ name: text, weight: z.number().nonnegative().max(100).nullable() })).min(1),
      deliverables: z.array(z.object({ title: text, criteria: z.array(text), sourceLine: text })).min(1),
    })
    .superRefine((raw, ctx) => {
      const names = new Set(raw.criteria.map((c) => norm(c.name)));
      if (names.size < raw.criteria.length) ctx.addIssue({ code: "custom", message: "criteria names must be unique" });
      for (const d of raw.deliverables) {
        if (!source.includes(norm(d.sourceLine)))
          ctx.addIssue({ code: "custom", message: `sourceLine is not copied word for word from the text: "${d.sourceLine}"` });
        for (const n of d.criteria)
          if (!names.has(norm(n))) ctx.addIssue({ code: "custom", message: `deliverable "${d.title}" names unknown criterion "${n}"` });
      }
    });

  const raw = await callJson(`BRIEF:\n${brief}\n\nRUBRIC:\n${rubric}`, schema, SYSTEM);

  // Weights: the rubric's when every criterion has one and they are not all 0, otherwise share 100 equally.
  // Kept as given (not rescaled), so a criterion the model missed cannot inflate the others.
  const given = raw.criteria.every((c) => c.weight !== null) && raw.criteria.some((c) => c.weight);
  const criteria = raw.criteria.map((c, i) => ({
    id: `c${i + 1}`,
    name: c.name,
    weight: Math.round((given ? (c.weight as number) : 100 / raw.criteria.length) * 10) / 10,
  }));
  const idByName = new Map(criteria.map((c) => [norm(c.name), c.id]));
  const deliverables = raw.deliverables.map((d, i) => ({
    id: `d${i + 1}`,
    title: d.title,
    criterionIds: [...new Set(d.criteria.map((n) => idByName.get(norm(n)) as string))],
    sourceLine: d.sourceLine,
  }));
  return { criteria, deliverables };
}
