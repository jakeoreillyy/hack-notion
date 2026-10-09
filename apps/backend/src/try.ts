// Role 1: run the full brief pipeline on a sample and print a summary.
// Usage: npm run try -- <name>   (reads samples/<name>.brief.txt and samples/<name>.rubric.txt)
import fs from "node:fs";
import { extractBrief } from "./lib/extract";
import { decompose } from "./lib/decompose";

const name = process.argv[2] ?? "marketing";
const brief = fs.readFileSync(`samples/${name}.brief.txt`, "utf8");
const rubric = fs.readFileSync(`samples/${name}.rubric.txt`, "utf8");

const { criteria, deliverables } = await extractBrief(brief, rubric);
const tasks = await decompose(criteria, deliverables, `${brief}\n${rubric}`);
// Sums of 1-decimal values pick up float noise (3 x 33.3 = 99.89999999999999).
const round1 = (n: number) => Math.round(n * 10) / 10;

console.log(`\nCRITERIA (weights sum ${round1(criteria.reduce((s, c) => s + c.weight, 0))})`);
for (const c of criteria) console.log(` ${c.id} ${c.name} ${c.weight}%`);
console.log("\nDELIVERABLES");
for (const d of deliverables) console.log(` ${d.id} ${d.title} [${d.criterionIds}]`);
console.log("\nTASKS");
for (const t of tasks)
  console.log(` ${t.id} [${t.criterionIds}] ${t.title} ${t.estimateH}h/${t.confidence} deps:${t.dependsOn.join(",") || "-"} ${t.requiredSkills.join("/")}`);

const covered = new Set(tasks.flatMap((t) => t.criterionIds));
const gaps = criteria.filter((c) => !covered.has(c.id)).map((c) => c.name);
const hoursBySkill: Record<string, number> = {};
for (const t of tasks) for (const s of t.requiredSkills) hoursBySkill[s] = (hoursBySkill[s] ?? 0) + t.estimateH / t.requiredSkills.length;
console.log(`\n${tasks.length} tasks, ${round1(tasks.reduce((s, t) => s + t.estimateH, 0))}h total`);
console.log("uncovered criteria:", gaps.length ? gaps : "none");
console.log("hours by skill:", Object.fromEntries(Object.entries(hoursBySkill).map(([k, v]) => [k, Math.round(v)])));
