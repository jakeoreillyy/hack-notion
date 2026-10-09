// Role 2: in-memory Map saved to data/projects.json.
// Every write goes to disk straight away (temp file + rename, so a crash never leaves half a file).
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Project } from "../schemas";
import type { Unavailable } from "./replan";

/**
 * Project plus what only the server needs: the day planning started (pins the capacity window) and
 * the change each open replan proposal answered (needed to confirm it).
 */
export type StoredProject = Project & { startDate: string; replanRequests: Record<string, Unavailable> };

export type Store = ReturnType<typeof createStore>;

export const DEFAULT_DATA_FILE = fileURLToPath(new URL("../../data/projects.json", import.meta.url));

/** `file: null` keeps everything in memory (tests). */
export function createStore(file: string | null = DEFAULT_DATA_FILE) {
  const projects = new Map<string, StoredProject>();
  if (file && existsSync(file)) {
    for (const p of JSON.parse(readFileSync(file, "utf8")) as StoredProject[]) projects.set(p.id, p);
  }

  const maxN = (ids: string[], prefix: string) =>
    ids.reduce((max, id) => Math.max(max, id.startsWith(prefix) ? Number(id.slice(prefix.length)) || 0 : 0), 0);
  let nextProject = maxN([...projects.keys()], "p_") + 1;
  let nextProposal = maxN([...projects.values()].flatMap((p) => Object.keys(p.proposals)), "pr_") + 1;

  function persist() {
    if (!file) return;
    writeFileSync(file + ".tmp", JSON.stringify([...projects.values()], null, 2));
    renameSync(file + ".tmp", file);
  }

  return {
    get: (id: string): StoredProject | undefined => structuredClone(projects.get(id)),

    /** Saves the whole project (insert or replace). */
    put(project: StoredProject): StoredProject {
      projects.set(project.id, structuredClone(project));
      persist();
      return project;
    },

    create(fields: Omit<StoredProject, "id" | "proposals" | "replanRequests">, id?: string): StoredProject {
      const project: StoredProject = { ...fields, id: id ?? `p_${nextProject++}`, proposals: {}, replanRequests: {} };
      projects.set(project.id, structuredClone(project));
      persist();
      return project;
    },

    newProposalId: () => `pr_${nextProposal++}`,
  };
}
