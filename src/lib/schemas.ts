// Role 2 owns this file. Frozen after the first 20 minutes: mirrors CONTRACT.md.
import { z } from "zod";

export const Skill = z.enum(["research", "writing", "data", "design", "presenting", "coding", "editing"]);
export const Status = z.enum(["todo", "doing", "done"]);
export const Confidence = z.enum(["low", "medium", "high"]);
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD

export const Member = z.object({
  name: z.string().min(1),
  hoursPerWeek: z.number().nonnegative(),
  skills: z.array(Skill),
  blocked: z.array(DateStr),
});
export const Criterion = z.object({ id: z.string(), name: z.string(), weight: z.number() });
export const Deliverable = z.object({
  id: z.string(),
  title: z.string(),
  criterionIds: z.array(z.string()),
  sourceLine: z.string(),
});
export const Task = z.object({
  id: z.string(),
  title: z.string(),
  criterionIds: z.array(z.string()),
  owner: z.string().nullable(),
  estimateH: z.number().nonnegative(),
  confidence: Confidence,
  start: DateStr.nullable(),
  due: DateStr.nullable(),
  dependsOn: z.array(z.string()),
  status: Status,
  requiredSkills: z.array(Skill),
  sourceLine: z.string().min(1), // a task without a sourceLine is a bug
});
export const Notification = z.object({
  taskId: z.string(),
  owner: z.string(),
  message: z.string(),
  daysLeft: z.number(),
});

export const Load = z.object({ member: z.string(), plannedH: z.number(), availableH: z.number() });
export const CoverageGap = z.object({ criterionId: z.string(), name: z.string() });
export const Risk = z.object({ type: z.string(), detail: z.string() });
export const Change = z.object({
  taskId: z.string(),
  field: z.enum(["owner", "start", "due"]),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

export const PlanView = z.object({
  projectId: z.string(),
  state: z.enum(["draft", "confirmed"]),
  criteria: z.array(Criterion),
  tasks: z.array(Task),
  load: z.array(Load),
  coverageGaps: z.array(CoverageGap),
  risks: z.array(Risk),
  notionUrl: z.string().nullable(),
  warnings: z.array(z.string()),
});

// Requests
export const CreateProjectRequest = z.object({
  brief: z.string().min(1),
  rubric: z.string().min(1),
  deadline: DateStr,
  members: z.array(Member).min(1),
});
export const UpdatePlanRequest = z.object({ tasks: z.array(Task) });
export const PatchTaskRequest = z.object({ status: Status });
export const ReplanRequest = z.object({
  change: z.object({ type: z.literal("unavailable"), member: z.string(), from: DateStr, to: DateStr }),
});
export const ReplanConfirmRequest = z.object({ proposalId: z.string() });

export const ReplanProposal = z.object({
  proposalId: z.string(),
  changes: z.array(Change),
  loadAfter: z.array(Load),
  explanation: z.string(),
  warnings: z.array(z.string()),
});

export type Skill = z.infer<typeof Skill>;
export type Status = z.infer<typeof Status>;
export type Member = z.infer<typeof Member>;
export type Criterion = z.infer<typeof Criterion>;
export type Deliverable = z.infer<typeof Deliverable>;
export type Task = z.infer<typeof Task>;
export type Notification = z.infer<typeof Notification>;
export type Load = z.infer<typeof Load>;
export type CoverageGap = z.infer<typeof CoverageGap>;
export type Risk = z.infer<typeof Risk>;
export type Change = z.infer<typeof Change>;
export type PlanView = z.infer<typeof PlanView>;
export type ReplanProposal = z.infer<typeof ReplanProposal>;
export type CreateProjectRequest = z.infer<typeof CreateProjectRequest>;

// Internal server-side record (not part of the API contract).
export type Project = {
  id: string;
  state: "draft" | "confirmed";
  brief: string;
  rubric: string;
  deadline: string;
  members: Member[];
  criteria: Criterion[];
  tasks: Task[];
  notionUrl: string | null;
  proposals: Record<string, ReplanProposal>;
};
