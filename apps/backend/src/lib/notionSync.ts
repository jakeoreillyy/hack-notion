// Role 4: createWorkspace, applyChanges, updateTaskStatus
//
// On Confirm, createWorkspace builds one page under the HQ page (NOTION_PARENT_PAGE_ID) holding:
//   - a Tasks database (one row per task) with Board, By person and Timeline views
//   - a Team agreement page and a Weekly check-ins page
// If the database can't be created, the page gets a plain task table instead (the plan's fallback).
//
// Notion row ids are kept in data/notion.json, keyed by project id, so status changes and confirmed
// replans can update the right rows after a restart. Writes go one at a time with a short delay
// because Notion allows about 3 requests a second.
import { Client, isFullDatabase, type BlockObjectRequest, type CreatePageParameters } from "@notionhq/client";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Change, Project, Status, Task } from "../schemas";

export type NotionApi = Pick<Client, "pages" | "databases" | "dataSources" | "views" | "blocks">;

/** What we remember about a project's workspace. `dataSourceId` is null when the table fallback was used. */
export type WorkspaceRecord = { pageId: string; url: string; dataSourceId: string | null; rows: Record<string, string> };

export type RecordStore = {
  get(projectId: string): WorkspaceRecord | undefined;
  set(projectId: string, record: WorkspaceRecord): void;
};

export type NotionSyncOptions = {
  client: NotionApi;
  parentPageId: string;
  records: RecordStore;
  /** Pause between writes. Keep it at about 350 ms for the real API. */
  delayMs?: number;
  log?: (message: string) => void;
};

type Props = NonNullable<CreatePageParameters["properties"]>;

const STATUS_LABEL: Record<Status, string> = { todo: "To do", doing: "Doing", done: "Done" };
const COLORS = ["blue", "green", "orange", "purple", "pink", "yellow", "red", "brown", "gray"] as const;
const MAX_CHILDREN = 100; // Notion's limit per create/append request

export function createNotionSync({ client, parentPageId, records, delayMs = 350, log = console.warn }: NotionSyncOptions) {
  const pause = () => (delayMs > 0 ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());

  async function createWorkspace(project: Project): Promise<string> {
    const existing = records.get(project.id);
    if (existing) return existing.url; // Confirm twice: same workspace

    let page;
    try {
      page = (await client.pages.create({
        parent: { page_id: parentPageId },
        icon: { type: "emoji", emoji: "🗂️" },
        properties: { title: { title: text(projectTitle(project)) } },
        children: introBlocks(project),
      })) as { id: string; url: string };
    } catch (e) {
      throw new Error(friendly(e));
    }
    const record: WorkspaceRecord = { pageId: page.id, url: page.url, dataSourceId: null, rows: {} };
    records.set(project.id, record);
    await pause();

    try {
      await buildDatabase(project, record);
    } catch (e) {
      log(`Notion: task database failed (${friendly(e)}); adding a plain task table instead.`);
      await appendChildren(page.id, [heading("Tasks"), taskTable(project)]);
    }

    await createChildPage(page.id, "Team agreement", "🤝", agreementBlocks(project));
    await createChildPage(page.id, "Weekly check-ins", "🗓️", checkInBlocks(project));
    return page.url;
  }

  async function buildDatabase(project: Project, record: WorkspaceRecord) {
    const db = await client.databases.create({
      parent: { type: "page_id", page_id: record.pageId },
      title: text("Tasks"),
      is_inline: true,
      initial_data_source: { properties: databaseProperties(project) },
    });
    const full = isFullDatabase(db) ? db : await client.databases.retrieve({ database_id: db.id });
    const dataSourceId = isFullDatabase(full) ? full.data_sources[0]?.id : undefined;
    if (!dataSourceId) throw new Error("Notion didn't return a data source for the new database.");
    record.dataSourceId = dataSourceId;
    records.set(project.id, record);
    await pause();

    const ordered = [...project.tasks].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || byId(a, b));
    for (const task of ordered) {
      const row = await client.pages.create({ parent: { data_source_id: dataSourceId }, properties: rowProperties(task, project) });
      record.rows[task.id] = row.id;
      records.set(project.id, record); // saved row by row, so a failure halfway still leaves usable ids
      await pause();
    }

    await createViews(db.id, dataSourceId);
  }

  // Views are a newer API; if one fails the database still has its default table view.
  async function createViews(databaseId: string, dataSourceId: string) {
    let ids: Record<string, string>;
    try {
      const ds = await client.dataSources.retrieve({ data_source_id: dataSourceId });
      ids = Object.fromEntries(Object.entries("properties" in ds ? ds.properties : {}).map(([name, p]) => [name, p.id]));
    } catch (e) {
      log(`Notion: couldn't read the database properties, so no extra views were added (${friendly(e)}).`);
      return;
    }
    const views: Parameters<NotionApi["views"]["create"]>[0][] = [
      {
        data_source_id: dataSourceId,
        database_id: databaseId,
        name: "Board",
        type: "board",
        configuration: { type: "board", group_by: { type: "select", property_id: ids.Status, sort: { type: "manual" } } },
      },
      {
        data_source_id: dataSourceId,
        database_id: databaseId,
        name: "By person",
        type: "board",
        configuration: { type: "board", group_by: { type: "select", property_id: ids.Owner, sort: { type: "ascending" } } },
      },
      {
        data_source_id: dataSourceId,
        database_id: databaseId,
        name: "Timeline",
        type: "timeline",
        configuration: { type: "timeline", date_property_id: ids.Start, end_date_property_id: ids.Due },
      },
    ];
    for (const view of views) {
      try {
        await client.views.create(view);
      } catch (e) {
        log(`Notion: couldn't add the "${view.name}" view (${friendly(e)}). Add it by hand with "+ Add view".`);
      }
      await pause();
    }
  }

  async function createChildPage(parentId: string, title: string, emoji: string, blocks: BlockObjectRequest[]) {
    try {
      const page = await client.pages.create({
        parent: { page_id: parentId },
        icon: { type: "emoji", emoji: emoji as "🤝" },
        properties: { title: { title: text(title) } },
        children: blocks.slice(0, MAX_CHILDREN),
      });
      await pause();
      await appendChildren(page.id, blocks.slice(MAX_CHILDREN));
    } catch (e) {
      log(`Notion: couldn't create the "${title}" page (${friendly(e)}).`);
    }
  }

  async function appendChildren(blockId: string, blocks: BlockObjectRequest[]) {
    for (let i = 0; i < blocks.length; i += MAX_CHILDREN) {
      await client.blocks.children.append({ block_id: blockId, children: blocks.slice(i, i + MAX_CHILDREN) });
      await pause();
    }
  }

  /** Finds the task's row, or creates it if the task was added after confirming. */
  async function rowFor(project: Project, taskId: string): Promise<string> {
    const record = records.get(project.id);
    if (!record) throw new Error("No Notion workspace is recorded for this project.");
    if (record.rows[taskId]) return record.rows[taskId];
    if (!record.dataSourceId) throw new Error("This workspace has a plain task table, so rows can't be updated.");
    const task = project.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} isn't in the plan.`);
    const row = await client.pages.create({ parent: { data_source_id: record.dataSourceId }, properties: rowProperties(task, project) });
    record.rows[taskId] = row.id;
    records.set(project.id, record);
    await pause();
    return row.id;
  }

  async function updateTaskStatus(project: Project, taskId: string, status: Status): Promise<void> {
    try {
      const pageId = await rowFor(project, taskId);
      await client.pages.update({ page_id: pageId, properties: { Status: { select: { name: STATUS_LABEL[status] } } } });
    } catch (e) {
      throw new Error(friendly(e));
    }
  }

  /** Writes a confirmed replan: one update per changed task, with its owner and dates as they are now. */
  async function applyChanges(project: Project, changes: Change[]): Promise<void> {
    const taskIds = [...new Set(changes.map((c) => c.taskId))];
    try {
      for (const id of taskIds) {
        const pageId = await rowFor(project, id);
        const props: Props = {};
        for (const c of changes.filter((c) => c.taskId === id)) {
          if (c.field === "owner") props.Owner = { select: c.to ? { name: optionName(c.to) } : null };
          if (c.field === "start") props.Start = { date: c.to ? { start: c.to } : null };
          if (c.field === "due") props.Due = { date: c.to ? { start: c.to } : null };
        }
        await client.pages.update({ page_id: pageId, properties: props });
        await pause();
      }
    } catch (e) {
      throw new Error(friendly(e));
    }
  }

  return { createWorkspace, updateTaskStatus, applyChanges };
}

// ---------- Module functions used by the backend (configured from apps/backend/.env) ----------

export const DEFAULT_RECORDS_FILE = fileURLToPath(new URL("../../data/notion.json", import.meta.url));

let fromEnv: ReturnType<typeof createNotionSync> | undefined;
function envSync() {
  const token = process.env.NOTION_TOKEN?.trim();
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID?.trim();
  if (!token || !parentPageId) {
    throw new Error("NOTION_TOKEN and NOTION_PARENT_PAGE_ID need to be set in apps/backend/.env.");
  }
  fromEnv ??= createNotionSync({ client: new Client({ auth: token }), parentPageId, records: fileRecordStore(DEFAULT_RECORDS_FILE) });
  return fromEnv;
}

export const createWorkspace = async (project: Project) => envSync().createWorkspace(project);
export const updateTaskStatus = async (project: Project, taskId: string, status: Status) =>
  envSync().updateTaskStatus(project, taskId, status);
export const applyChanges = async (project: Project, changes: Change[]) => envSync().applyChanges(project, changes);

// ---------- Record stores ----------

export function fileRecordStore(file: string): RecordStore {
  const all: Record<string, WorkspaceRecord> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  return {
    get: (id) => (all[id] ? structuredClone(all[id]) : undefined),
    set(id, record) {
      all[id] = structuredClone(record);
      writeFileSync(file + ".tmp", JSON.stringify(all, null, 2));
      renameSync(file + ".tmp", file);
    },
  };
}

export function memoryRecordStore(): RecordStore {
  const all = new Map<string, WorkspaceRecord>();
  return { get: (id) => (all.has(id) ? structuredClone(all.get(id)) : undefined), set: (id, r) => void all.set(id, structuredClone(r)) };
}

// ---------- Content ----------

/** First line of the brief, e.g. "MK301 Marketing Strategy: Group Assignment". */
export function projectTitle(project: Project): string {
  const first = project.brief.split("\n").map((l) => l.trim()).find(Boolean) ?? "Group project";
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

export function databaseProperties(project: Project) {
  const skills = [...new Set(project.tasks.flatMap((t) => t.requiredSkills))].sort();
  return {
    Task: { title: {} },
    Status: {
      select: {
        options: [
          { name: STATUS_LABEL.todo, color: "gray" as const },
          { name: STATUS_LABEL.doing, color: "blue" as const },
          { name: STATUS_LABEL.done, color: "green" as const },
        ],
      },
    },
    Owner: { select: { options: project.members.map((m, i) => ({ name: optionName(m.name), color: COLORS[i % COLORS.length] })) } },
    Start: { date: {} },
    Due: { date: {} },
    Hours: { number: { format: "number" as const } },
    Confidence: { select: { options: ["low", "medium", "high"].map((name) => ({ name })) } },
    Criteria: { multi_select: { options: project.criteria.map((c) => ({ name: criterionName(project, c.id) })) } },
    Skills: { multi_select: { options: skills.map((name) => ({ name })) } },
    "Depends on": { rich_text: {} },
    "Source line": { rich_text: {} },
    "Task ID": { rich_text: {} },
  };
}

export function rowProperties(task: Task, project: Project): Props {
  const titles = new Map(project.tasks.map((t) => [t.id, t.title]));
  return {
    Task: { title: text(task.title) },
    Status: { select: { name: STATUS_LABEL[task.status] } },
    Owner: { select: task.owner ? { name: optionName(task.owner) } : null },
    Start: { date: task.start ? { start: task.start } : null },
    Due: { date: task.due ? { start: task.due } : null },
    Hours: { number: task.estimateH },
    Confidence: { select: { name: task.confidence } },
    Criteria: { multi_select: task.criterionIds.filter((id) => project.criteria.some((c) => c.id === id)).map((id) => ({ name: criterionName(project, id) })) },
    Skills: { multi_select: task.requiredSkills.map((name) => ({ name })) },
    "Depends on": { rich_text: text(task.dependsOn.map((id) => titles.get(id) ?? id).join(", ")) },
    "Source line": { rich_text: text(task.sourceLine) },
    "Task ID": { rich_text: text(task.id) },
  };
}

function introBlocks(project: Project): BlockObjectRequest[] {
  return [
    paragraph(`Deadline: ${formatDay(project.deadline)}. Team: ${project.members.map((m) => m.name).join(", ")}.`),
    paragraph(
      "Made with Group Project Autopilot after the team confirmed the plan. Owners are shown by name, not as Notion users. " +
        "Status changes and confirmed replans from the web app update this page automatically.",
    ),
  ];
}

// Placeholder wording until Role 5's team agreement template lands.
function agreementBlocks(project: Project): BlockObjectRequest[] {
  const sections: [string, string[]][] = [
    ["How we talk", ["Main chat for updates; reply within a day.", "Say early if you're stuck or running late."]],
    ["Meetings", ["A short weekly check-in (see Weekly check-ins).", "Anyone can call an extra one before a deadline."]],
    ["Deadlines", [`Final hand-in: ${formatDay(project.deadline)}.`, "Aim to finish two working days early to leave time for review."]],
    ["Quality", ["Every section gets read by someone other than its author.", "Reference sources as the brief asks."]],
    ["If someone falls behind", ["Tell the team as soon as you know.", "Mark yourself unavailable in the app and review the suggested replan together."]],
  ];
  return [
    paragraph("Agreed by the whole team. Change it together if it stops working."),
    ...sections.flatMap(([title, points]) => [heading(title), ...points.map(bullet)]),
    heading("Signed"),
    ...project.members.map((m) => todo(m.name)),
  ];
}

function checkInBlocks(project: Project): BlockObjectRequest[] {
  const dated = project.tasks.filter((t) => t.due);
  if (dated.length === 0) return [paragraph("No dated tasks yet.")];
  const first = mondayOf(dated.map((t) => t.start ?? t.due!).sort()[0]);
  const last = mondayOf([...dated.map((t) => t.due!), project.deadline].sort().at(-1)!);
  const blocks: BlockObjectRequest[] = [paragraph("Each week: what you finished, what's next, anything blocking you.")];
  for (let week = first; week <= last; week = addDays(week, 7)) {
    const friday = addDays(week, 4);
    const due = dated.filter((t) => t.due! >= week && t.due! <= addDays(week, 6)).sort((a, b) => a.due!.localeCompare(b.due!));
    blocks.push(heading(`Week of ${formatDay(week)}`));
    blocks.push(paragraph(due.length ? "Due this week:" : "Nothing due this week."));
    for (const t of due) blocks.push(bullet(`${t.title} (${t.owner ?? "unassigned"}, due ${formatDay(t.due!)})`));
    for (const m of project.members) blocks.push(todo(`${m.name} checked in by ${formatDay(friday)}`));
  }
  return blocks;
}

function taskTable(project: Project): BlockObjectRequest {
  const header = ["Task", "Owner", "Status", "Start", "Due", "Hours"];
  const rows = [...project.tasks]
    .sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999") || byId(a, b))
    .map((t) => [t.title, t.owner ?? "-", STATUS_LABEL[t.status], t.start ?? "-", t.due ?? "-", String(t.estimateH)]);
  return {
    type: "table",
    table: {
      table_width: header.length,
      has_column_header: true,
      has_row_header: false,
      children: [header, ...rows].slice(0, MAX_CHILDREN).map((cells) => ({
        type: "table_row" as const,
        table_row: { cells: cells.map((c) => text(c)) },
      })),
    },
  } as BlockObjectRequest;
}

// ---------- Helpers ----------

/** Notion text is capped at 2000 characters per item. */
const text = (s: string) => (s ? [{ type: "text" as const, text: { content: s.slice(0, 2000) } }] : []);
const paragraph = (s: string): BlockObjectRequest => ({ type: "paragraph", paragraph: { rich_text: text(s) } });
const heading = (s: string): BlockObjectRequest => ({ type: "heading_3", heading_3: { rich_text: text(s) } });
const bullet = (s: string): BlockObjectRequest => ({ type: "bulleted_list_item", bulleted_list_item: { rich_text: text(s) } });
const todo = (s: string): BlockObjectRequest => ({ type: "to_do", to_do: { rich_text: text(s), checked: false } });

/** Select option names can't contain commas and are capped at 100 characters. */
export const optionName = (s: string) => s.replace(/,/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
const criterionName = (project: Project, id: string) => {
  const c = project.criteria.find((x) => x.id === id);
  return optionName(c ? `${c.name} (${c.weight}%)` : id);
};

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id, "en", { numeric: true });
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (d: string) => addDays(d, -((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7));
const formatDay = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Turns Notion errors into a sentence a student can act on. */
export function friendly(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  switch (code) {
    case "unauthorized":
      return "Notion rejected the token. Check NOTION_TOKEN in apps/backend/.env.";
    case "restricted_resource":
    case "object_not_found":
      return "Notion can't see the HQ page. Open it in Notion, then ••• → Connections → add the integration.";
    case "rate_limited":
      return "Notion is busy (rate limit). Try again in a minute.";
    case "validation_error":
      return `Notion refused the request: ${(e as Error).message}`;
    default:
      return e instanceof Error ? e.message : String(e);
  }
}
