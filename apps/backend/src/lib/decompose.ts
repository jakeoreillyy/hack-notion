// Role 1: deliverables -> coarse tasks. owner/start/due are null (Role 2's scheduler fills them in).
import { z } from "zod";
import { callJson } from "./llm";
import { norm } from "./extract";
import { Confidence, Skill, type Criterion, type Deliverable, type Task } from "../schemas";

const SYSTEM = `You break a group project into tasks for a student team.
Return JSON: {"tasks":[{"id":string,"title":string,"criterionIds":[string],"estimateH":number,"confidence":"low"|"medium"|"high","dependsOn":[string],"requiredSkills":[string],"sourceLine":string}]}
- Produce 15 to 25 coarse tasks (roughly 2 to 8 hours each), not tiny steps.
- id is "t1", "t2", ... in order, each unique.
- criterionIds: the ids of the rubric criteria the task earns marks under. Use only the criterion ids given.
- dependsOn: ids of tasks that must finish first. Use only ids of other tasks. No cycles.
- requiredSkills: only from [${Skill.options.join(", ")}].
- estimateH is a rough guess in hours. Use confidence "low" when unsure.
- sourceLine: a sentence copied word for word from the brief or rubric (or a deliverable's sourceLine) that justifies the task. Never paraphrase it.
- Every criterion should be covered by at least one task.`;

const text = z.string().trim().min(1);
const isSkill = (s: string): s is Skill => Skill.safeParse(s).success;

// Returns the id of a task on a dependency cycle, or undefined if there is none.
function findCycle(tasks: { id: string; dependsOn: string[] }[]): string | undefined {
  const deps = new Map(tasks.map((t) => [t.id, t.dependsOn]));
  const state = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
  const visit = (id: string): string | undefined => {
    if (state.get(id) === 2) return undefined;
    if (state.get(id) === 1) return id;
    state.set(id, 1);
    for (const d of deps.get(id) ?? []) {
      const hit = visit(d);
      if (hit) return hit;
    }
    state.set(id, 2);
    return undefined;
  };
  for (const t of tasks) {
    const hit = visit(t.id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * sourceText is the brief and rubric joined with a newline. Task source lines must be quoted from it, or, when it is
 * not given, from the deliverables' source lines (which extractBrief already checked against the brief).
 */
export async function decompose(criteria: Criterion[], deliverables: Deliverable[], sourceText = ""): Promise<Task[]> {
  const source = norm(sourceText) || norm(deliverables.map((d) => d.sourceLine).join("\n"));
  const criterionIds = new Set(criteria.map((c) => c.id));

  const schema = z
    .object({
      tasks: z
        .array(
          z.object({
            id: text,
            title: text,
            criterionIds: z.array(z.string()),
            estimateH: z.number().positive(),
            confidence: Confidence.catch("low"),
            dependsOn: z.array(z.string()),
            // Plain strings: an off-list skill is dropped below rather than failing the whole reply.
            requiredSkills: z.array(z.string()),
            sourceLine: text,
          }),
        )
        .min(5)
        .max(30),
    })
    .superRefine(({ tasks }, ctx) => {
      const ids = new Set(tasks.map((t) => t.id));
      if (ids.size !== tasks.length) ctx.addIssue({ code: "custom", message: "task ids must be unique" });
      for (const t of tasks) {
        if (!source.includes(norm(t.sourceLine)))
          ctx.addIssue({ code: "custom", message: `task ${t.id}: sourceLine is not copied word for word: "${t.sourceLine}"` });
        for (const c of t.criterionIds)
          if (!criterionIds.has(c)) ctx.addIssue({ code: "custom", message: `task ${t.id}: unknown criterion "${c}"` });
        for (const d of t.dependsOn)
          if (!ids.has(d)) ctx.addIssue({ code: "custom", message: `task ${t.id}: unknown dependency "${d}"` });
      }
      const cycle = findCycle(tasks);
      if (cycle) ctx.addIssue({ code: "custom", message: `dependencies contain a cycle through task ${cycle}` });
    });

  const prompt = `CRITERIA:\n${JSON.stringify(criteria)}\n\nDELIVERABLES:\n${JSON.stringify(deliverables)}${
    sourceText.trim() ? `\n\nBRIEF AND RUBRIC:\n${sourceText}` : ""
  }`;
  const { tasks } = await callJson(prompt, schema, SYSTEM);

  return tasks.map((t) => ({
    ...t,
    owner: null,
    start: null,
    due: null,
    status: "todo" as const,
    requiredSkills: t.requiredSkills.map((s) => s.toLowerCase()).filter(isSkill),
  }));
}
