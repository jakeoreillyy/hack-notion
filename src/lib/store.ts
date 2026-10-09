// Role 2: state in a Map, saved to data/projects.json. No database.
import fs from "node:fs";
import path from "node:path";
import type { Project } from "./schemas";
import fixture from "./fixtures/project.json";

const FILE = path.join(process.cwd(), "data", "projects.json");
const g = globalThis as unknown as { __projects?: Map<string, Project> };

function load(): Map<string, Project> {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(FILE, "utf8"))));
  } catch {
    return new Map();
  }
}

const projects = (g.__projects ??= load());

function persist() {
  fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(projects), null, 2));
}

export function getProject(id: string): Project | undefined {
  return projects.get(id);
}

export function saveProject(p: Project): void {
  projects.set(p.id, p);
  persist();
}

export function newProjectId(): string {
  return `p_${projects.size + 1}`;
}

export function fixtureProject(): Project {
  return structuredClone(fixture) as Project;
}
