// Role 3: every call the pages make to the backend goes through here.
import type { CreateProjectRequest, Notification, PlanView, ReplanProposal, Status, Task } from "@contract";
import mock from "../../mock/response.json";
import { addDays, daysBetween, formatDay, todayISO } from "./dates";

// true: pages use mock/response.json. Flip to false once apps/backend serves real data.
export const USE_MOCK = true;

export type Unavailability = { member: string; from: string; to: string };

// ---- Mock-only stand-ins for the backend --------------------------------------------------

const MOCK_KEY = "autopilot-mock-plan";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const freshMock = () => structuredClone(mock.planView) as unknown as PlanView;

// The "server" copy of the plan. Kept in sessionStorage so a page refresh doesn't lose edits.
let mockPlan: PlanView | null = null;

function loadMock(): PlanView {
  if (!mockPlan) {
    try {
      const saved = sessionStorage.getItem(MOCK_KEY);
      if (saved) mockPlan = JSON.parse(saved) as PlanView;
    } catch {}
    mockPlan ??= freshMock();
  }
  return mockPlan;
}

function saveMock(plan: PlanView): PlanView {
  mockPlan = plan;
  try {
    sessionStorage.setItem(MOCK_KEY, JSON.stringify(plan));
  } catch {}
  return plan;
}

// Recompute load and coverage after edits. Risks are left as they came from the mock file.
function analyseMock(plan: PlanView): PlanView {
  const load = plan.load.map((l) => ({
    ...l,
    plannedH: plan.tasks.filter((t) => t.owner === l.member).reduce((sum, t) => sum + t.estimateH, 0),
  }));
  const coverageGaps = plan.criteria
    .filter((c) => !plan.tasks.some((t) => t.criterionIds.includes(c.id)))
    .map((c) => ({ criterionId: c.id, name: c.name }));
  return { ...plan, load, coverageGaps };
}

// The 2-day rule from CONTRACT.md (Role 1 owns the real one).
function notificationsMock(tasks: Task[], today: string): Notification[] {
  return tasks
    .filter((t) => t.status !== "done" && t.owner && t.due && daysBetween(today, t.due) <= 2)
    .map((t) => {
      const daysLeft = daysBetween(today, t.due!);
      const when =
        daysLeft < 0
          ? `is ${-daysLeft} ${daysLeft === -1 ? "day" : "days"} overdue`
          : daysLeft === 0
            ? "is due today"
            : `is due in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
      const started = t.status === "todo" ? " and hasn't been started" : "";
      return { taskId: t.id, owner: t.owner!, daysLeft, message: `'${t.title}' ${when}${started}.` };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// Rough stand-in for Role 2's replan: each of the member's unfinished tasks that overlaps the
// away window goes to whoever has the most free time left. Only owners change.
const mockProposals = new Map<string, ReplanProposal>();

function replanMock(plan: PlanView, change: Unavailability): ReplanProposal {
  const load = new Map(plan.load.map((l) => [l.member, { ...l }]));
  const away = load.get(change.member);
  const dated = plan.tasks.filter((t) => t.due);
  const firstDay = dated.map((t) => t.start ?? t.due!).sort()[0];
  const lastDay = dated.map((t) => t.due!).sort().at(-1)!;
  if (away && firstDay) {
    const perDay = away.availableH / Math.max(1, weekdaysBetween(firstDay, lastDay));
    away.availableH = Math.max(0, +(away.availableH - perDay * weekdaysBetween(change.from, change.to)).toFixed(1));
  }

  const affected = plan.tasks
    .filter((t) => t.owner === change.member && t.status !== "done" && t.start && t.due)
    .filter((t) => t.start! <= change.to && t.due! >= change.from)
    .sort((a, b) => a.due!.localeCompare(b.due!));

  const changes: ReplanProposal["changes"] = [];
  const moved: string[] = [];
  for (const t of affected) {
    const others = [...load.values()].filter((l) => l.member !== change.member);
    if (others.length === 0) break;
    const target = others.sort(
      (a, b) =>
        (a.plannedH + t.estimateH) / (a.availableH || 1) - (b.plannedH + t.estimateH) / (b.availableH || 1) ||
        a.member.localeCompare(b.member),
    )[0];
    target.plannedH += t.estimateH;
    if (away) away.plannedH -= t.estimateH;
    changes.push({ taskId: t.id, field: "owner", from: change.member, to: target.member });
    moved.push(`'${t.title}' moves to ${target.member}`);
  }

  const window = `${formatDay(change.from)} to ${formatDay(change.to)}`;
  const explanation =
    moved.length === 0
      ? `${change.member} can't work from ${window}, but none of their tasks fall in that time, so nothing needs to change.`
      : `${change.member} can't work from ${window}, so ${moved.join(" and ")}.`;

  const proposal: ReplanProposal = {
    proposalId: `pr_${mockProposals.size + 1}`,
    changes,
    loadAfter: [...load.values()],
    explanation,
    warnings: [],
  };
  mockProposals.set(proposal.proposalId, proposal);
  return proposal;
}

function weekdaysBetween(from: string, to: string) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

// ---- Real backend --------------------------------------------------------------------------

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

// ---- Calls used by the pages ---------------------------------------------------------------

export async function createProject(req: CreateProjectRequest): Promise<PlanView> {
  if (USE_MOCK) {
    console.log("[mock] POST /api/projects", req);
    await delay(600);
    return saveMock(freshMock());
  }
  return request<PlanView>("/api/projects", { method: "POST", body: JSON.stringify(req) });
}

export async function getProject(id: string): Promise<PlanView> {
  if (USE_MOCK) return loadMock();
  return request<PlanView>(`/api/projects/${id}`);
}

export async function updatePlan(id: string, tasks: Task[]): Promise<PlanView> {
  if (USE_MOCK) return saveMock(analyseMock({ ...loadMock(), tasks }));
  return request<PlanView>(`/api/projects/${id}/plan`, { method: "PUT", body: JSON.stringify({ tasks }) });
}

export async function confirmPlan(id: string): Promise<PlanView> {
  if (USE_MOCK) {
    await delay(800);
    return saveMock({ ...loadMock(), state: "confirmed", notionUrl: "https://www.notion.so/mock-workspace" });
  }
  return request<PlanView>(`/api/projects/${id}/confirm`, { method: "POST" });
}

export async function setTaskStatus(id: string, taskId: string, status: Status): Promise<PlanView> {
  if (USE_MOCK) {
    const plan = loadMock();
    return saveMock({ ...plan, tasks: plan.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) });
  }
  return request<PlanView>(`/api/projects/${id}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status }) });
}

export async function getNotifications(id: string, today?: string): Promise<Notification[]> {
  if (USE_MOCK) return notificationsMock(loadMock().tasks, today ?? todayISO());
  const query = today ? `?today=${today}` : "";
  const body = await request<{ notifications: Notification[] }>(`/api/projects/${id}/notifications${query}`);
  return body.notifications;
}

export async function proposeReplan(id: string, change: Unavailability): Promise<ReplanProposal> {
  if (USE_MOCK) {
    await delay(600);
    return replanMock(loadMock(), change);
  }
  return request<ReplanProposal>(`/api/projects/${id}/replan`, {
    method: "POST",
    body: JSON.stringify({ change: { type: "unavailable", ...change } }),
  });
}

export async function confirmReplan(id: string, proposalId: string): Promise<PlanView> {
  if (USE_MOCK) {
    const proposal = mockProposals.get(proposalId);
    if (!proposal) throw new Error("That suggestion has expired. Make a new one.");
    await delay(600);
    const plan = loadMock();
    const tasks = plan.tasks.map((t) =>
      proposal.changes
        .filter((c) => c.taskId === t.id)
        .reduce<Task>((task, c) => ({ ...task, [c.field]: c.to }), t),
    );
    mockProposals.clear();
    return saveMock(analyseMock({ ...plan, tasks, load: proposal.loadAfter }));
  }
  return request<PlanView>(`/api/projects/${id}/replan/confirm`, {
    method: "POST",
    body: JSON.stringify({ proposalId }),
  });
}
