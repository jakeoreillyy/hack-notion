// Role 2: the routes' view of Role 1 and Role 4 modules.
// Each function is loaded from its owner's module if it exists yet, otherwise a fallback is used so
// every endpoint works from day one. Once a role exports the real function, a restart picks it up.
import { readFileSync } from "node:fs";
import type { Change, Criterion, Deliverable, Notification, Project, Status, Task } from "../schemas";

export type Deps = {
  extractBrief(brief: string, rubric: string): Promise<{ criteria: Criterion[]; deliverables: Deliverable[] }>;
  decompose(criteria: Criterion[], deliverables: Deliverable[]): Promise<Task[]>;
  findNotifications(tasks: Task[], today: string): Notification[];
  createWorkspace(project: Project): Promise<string>;
  applyChanges(project: Project, changes: Change[]): Promise<void>;
  updateTaskStatus(project: Project, taskId: string, status: Status): Promise<void>;
  /** Local date as YYYY-MM-DD. The only place the backend reads the clock. */
  today(): string;
  /** Names of functions currently using a fallback. */
  fallbacks: string[];
};

const fixture = <T>(file: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));

export const fallbackDeps: Omit<Deps, "fallbacks"> = {
  async extractBrief() {
    const p = fixture<Project>("project.json");
    return { criteria: p.criteria, deliverables: [] };
  },
  async decompose() {
    return fixture<Task[]>("tasks.json");
  },
  findNotifications,
  async createWorkspace() {
    throw new Error("Notion sync isn't set up yet, so no workspace was created.");
  },
  async applyChanges() {},
  async updateTaskStatus() {},
  today: () => new Date().toLocaleDateString("en-CA"),
};

export async function loadDeps(): Promise<Deps> {
  type Mod = Partial<Deps>;
  const [extract, decompose, notifications, notion] = (await Promise.all([
    import("./extract"),
    import("./decompose"),
    import("./notifications"),
    import("./notionSync"),
  ])) as Mod[];

  const fallbacks: string[] = [];
  const pick = <K extends keyof Omit<Deps, "fallbacks" | "today">>(mod: Mod, name: K): Deps[K] => {
    if (typeof mod[name] === "function") return mod[name] as Deps[K];
    fallbacks.push(name);
    return fallbackDeps[name] as Deps[K];
  };

  return {
    extractBrief: pick(extract, "extractBrief"),
    decompose: pick(decompose, "decompose"),
    findNotifications: pick(notifications, "findNotifications"),
    createWorkspace: pick(notion, "createWorkspace"),
    applyChanges: pick(notion, "applyChanges"),
    updateTaskStatus: pick(notion, "updateTaskStatus"),
    today: fallbackDeps.today,
    fallbacks,
  };
}

/** Fallback for Role 1's findNotifications: the 2-day rule from CONTRACT.md. */
export function findNotifications(tasks: Task[], today: string): Notification[] {
  const out: Notification[] = [];
  for (const t of tasks) {
    if (t.status === "done" || !t.owner || !t.due) continue;
    const daysLeft = Math.round((Date.parse(t.due) - Date.parse(today)) / 86_400_000);
    if (daysLeft > 2) continue;
    const when =
      daysLeft < 0
        ? `was due ${-daysLeft === 1 ? "yesterday" : `${-daysLeft} days ago`}`
        : daysLeft === 0
          ? "is due today"
          : `is due in ${daysLeft === 1 ? "1 day" : `${daysLeft} days`}`;
    const started = t.status === "todo" ? " and hasn't been started" : "";
    out.push({ taskId: t.id, owner: t.owner, message: `'${t.title}' ${when}${started}.`, daysLeft });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.taskId.localeCompare(b.taskId, "en", { numeric: true }));
}
