// Role 4: notionSync tests against a fake Notion client that records every call. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Project } from "../schemas";
import {
  createNotionSync,
  createWorkspace as createWorkspaceFromEnv,
  friendly,
  memoryRecordStore,
  type NotionApi,
} from "./notionSync";

const project: Project = {
  id: "p_1",
  state: "confirmed",
  brief: "\nMK301 Marketing Strategy: Group Assignment\nStudents must analyse at least three competitors.",
  rubric: "Market analysis (25%)",
  deadline: "2026-11-06",
  members: [
    { name: "Alex", hoursPerWeek: 8, skills: ["research", "writing"], blocked: [] },
    { name: "Jo", hoursPerWeek: 10, skills: ["data", "presenting"], blocked: [] },
  ],
  criteria: [
    { id: "c1", name: "Market analysis", weight: 25 },
    { id: "c2", name: "Structure, style and writing", weight: 15 },
  ],
  tasks: [
    { id: "t2", title: "Analyse competitors", criterionIds: ["c1"], owner: "Jo", estimateH: 5, confidence: "low", start: "2026-10-19", due: "2026-10-22", dependsOn: ["t1"], status: "todo", requiredSkills: ["data"], sourceLine: "Students must analyse at least three competitors." },
    { id: "t1", title: "Research competitors", criterionIds: ["c1", "c2"], owner: "Alex", estimateH: 4, confidence: "medium", start: "2026-10-12", due: "2026-10-14", dependsOn: [], status: "done", requiredSkills: ["research"], sourceLine: "Students must analyse at least three competitors." },
    { id: "t3", title: "Unassigned task", criterionIds: [], owner: null, estimateH: 1, confidence: "high", start: null, due: null, dependsOn: [], status: "todo", requiredSkills: [], sourceLine: "Students must analyse at least three competitors." },
  ],
  notionUrl: null,
  proposals: {},
};

type Call = { method: string; args: any };

function fakeClient(fail: Partial<Record<string, unknown>> = {}) {
  const calls: Call[] = [];
  let n = 0;
  const record = (method: string, result: (args: any) => unknown) => async (args: any) => {
    calls.push({ method, args });
    if (fail[method]) throw fail[method];
    return result(args);
  };
  const client = {
    pages: {
      create: record("pages.create", () => ({ object: "page", id: `page_${++n}`, url: `https://notion.so/page_${n}` })),
      update: record("pages.update", (a) => ({ object: "page", id: a.page_id })),
    },
    databases: {
      create: record("databases.create", () => ({ object: "database", id: "db_1", title: [], data_sources: [{ id: "ds_1", name: "Tasks" }] })),
      retrieve: record("databases.retrieve", () => ({ object: "database", id: "db_1", title: [], data_sources: [{ id: "ds_1" }] })),
    },
    dataSources: {
      retrieve: record("dataSources.retrieve", () => ({
        object: "data_source",
        properties: { Status: { id: "st" }, Owner: { id: "ow" }, Start: { id: "sa" }, Due: { id: "du" } },
      })),
    },
    views: { create: record("views.create", () => ({})) },
    blocks: { children: { append: record("blocks.children.append", () => ({})) } },
  };
  return { client: client as unknown as NotionApi, calls };
}

function setup(fail?: Partial<Record<string, unknown>>) {
  const { client, calls } = fakeClient(fail);
  const logs: string[] = [];
  const records = memoryRecordStore();
  const sync = createNotionSync({ client, parentPageId: "hq", records, delayMs: 0, log: (m) => logs.push(m) });
  return { sync, calls, logs, records };
}

const named = (calls: Call[], method: string) => calls.filter((c) => c.method === method);
const pageTitle = (c: Call) => c.args.properties.title?.title[0]?.text.content;

test("createWorkspace builds the page, database, rows, views and child pages", async () => {
  const { sync, calls, logs, records } = setup();
  const url = await sync.createWorkspace(project);

  assert.equal(url, "https://notion.so/page_1");
  assert.deepEqual(logs, []);

  const pages = named(calls, "pages.create");
  assert.equal(pages[0].args.parent.page_id, "hq");
  assert.equal(pageTitle(pages[0]), "MK301 Marketing Strategy: Group Assignment");

  const db = named(calls, "databases.create")[0].args;
  assert.equal(db.parent.page_id, "page_1");
  assert.deepEqual(Object.keys(db.initial_data_source.properties), [
    "Task", "Status", "Owner", "Start", "Due", "Hours", "Confidence", "Criteria", "Skills", "Depends on", "Source line", "Task ID",
  ]);
  assert.deepEqual(db.initial_data_source.properties.Owner.select.options.map((o: any) => o.name), ["Alex", "Jo"]);
  assert.ok(db.initial_data_source.properties.Criteria.multi_select.options.every((o: any) => !o.name.includes(",")), "no commas in options");

  // Rows in due order, undated last, all in the new data source.
  const rows = pages.filter((c) => c.args.parent.data_source_id === "ds_1");
  assert.deepEqual(rows.map((r) => r.args.properties["Task ID"].rich_text[0].text.content), ["t1", "t2", "t3"]);

  assert.deepEqual(named(calls, "views.create").map((c) => [c.args.name, c.args.type]), [
    ["Board", "board"], ["By person", "board"], ["Timeline", "timeline"],
  ]);
  assert.equal(named(calls, "views.create")[0].args.configuration.group_by.property_id, "st");
  assert.deepEqual(named(calls, "views.create")[2].args.configuration, { type: "timeline", date_property_id: "sa", end_date_property_id: "du" });

  assert.deepEqual(pages.filter((c) => c.args.parent.page_id === "page_1").map(pageTitle), ["Team agreement", "Weekly check-ins"]);
  assert.deepEqual(records.get("p_1"), {
    pageId: "page_1", url, dataSourceId: "ds_1", rows: { t1: "page_2", t2: "page_3", t3: "page_4" },
  });
});

test("row properties map every task field", async () => {
  const { sync, calls } = setup();
  await sync.createWorkspace(project);
  const rows = named(calls, "pages.create").filter((c) => c.args.parent.data_source_id);
  const t2 = rows[1].args.properties;
  assert.deepEqual(t2.Status, { select: { name: "To do" } });
  assert.deepEqual(t2.Owner, { select: { name: "Jo" } });
  assert.deepEqual(t2.Due, { date: { start: "2026-10-22" } });
  assert.deepEqual(t2.Hours, { number: 5 });
  assert.deepEqual(t2.Criteria, { multi_select: [{ name: "Market analysis (25%)" }] });
  assert.equal(t2["Depends on"].rich_text[0].text.content, "Research competitors");
  assert.deepEqual(rows[0].args.properties.Status, { select: { name: "Done" } });
  assert.deepEqual(rows[0].args.properties.Criteria.multi_select[1], { name: "Structure style and writing (15%)" });

  const t3 = rows[2].args.properties;
  assert.deepEqual(t3.Owner, { select: null });
  assert.deepEqual(t3.Start, { date: null });
  assert.deepEqual(t3["Depends on"], { rich_text: [] });
});

test("check-in page has a week per Monday up to the deadline and a to-do per member", async () => {
  const { sync, calls } = setup();
  await sync.createWorkspace(project);
  const checkIn = named(calls, "pages.create").find((c) => pageTitle(c) === "Weekly check-ins")!.args.children;
  const weeks = checkIn.filter((b: any) => b.type === "heading_3").map((b: any) => b.heading_3.rich_text[0].text.content);
  assert.deepEqual(weeks, ["Week of Mon 12 Oct", "Week of Mon 19 Oct", "Week of Mon 26 Oct", "Week of Mon 2 Nov"]);
  assert.equal(checkIn.filter((b: any) => b.type === "to_do").length, 8);
});

test("confirming twice returns the same workspace without new calls", async () => {
  const { sync, calls } = setup();
  const first = await sync.createWorkspace(project);
  const count = calls.length;
  assert.equal(await sync.createWorkspace(project), first);
  assert.equal(calls.length, count);
});

test("database failure falls back to a plain task table", async () => {
  const { sync, calls, logs, records } = setup({ "databases.create": new Error("database creation is not allowed") });
  const url = await sync.createWorkspace(project);
  assert.equal(url, "https://notion.so/page_1");
  const append = named(calls, "blocks.children.append")[0].args;
  assert.equal(append.block_id, "page_1");
  const table = append.children[1].table;
  assert.equal(table.children.length, 4, "header + 3 tasks");
  assert.match(logs[0], /plain task table/);
  assert.equal(records.get("p_1")!.dataSourceId, null);
  await assert.rejects(sync.updateTaskStatus(project, "t1", "doing"), /plain task table/);
});

test("a failing view is logged, the rest still get created", async () => {
  const { sync, calls, logs } = setup({ "views.create": new Error("views not supported") });
  await sync.createWorkspace(project);
  assert.equal(named(calls, "views.create").length, 3);
  assert.equal(logs.length, 3);
  assert.match(logs[0], /Add it by hand/);
});

test("auth and sharing problems throw a readable message", async () => {
  const unauthorized = Object.assign(new Error("API token is invalid."), { code: "unauthorized" });
  await assert.rejects(setup({ "pages.create": unauthorized }).sync.createWorkspace(project), /Check NOTION_TOKEN/);
  const hidden = Object.assign(new Error("Could not find page"), { code: "object_not_found" });
  await assert.rejects(setup({ "pages.create": hidden }).sync.createWorkspace(project), /Connections/);
});

test("updateTaskStatus updates the task's row", async () => {
  const { sync, calls } = setup();
  await sync.createWorkspace(project);
  await sync.updateTaskStatus(project, "t2", "doing");
  assert.deepEqual(named(calls, "pages.update").at(-1)!.args, {
    page_id: "page_3",
    properties: { Status: { select: { name: "Doing" } } },
  });
});

test("updateTaskStatus creates a row for a task added after confirming", async () => {
  const { sync, calls, records } = setup();
  await sync.createWorkspace(project);
  const added = { ...project, tasks: [...project.tasks, { ...project.tasks[0], id: "t9", title: "New task" }] };
  await sync.updateTaskStatus(added, "t9", "doing");
  const created = named(calls, "pages.create").at(-1)!.args;
  assert.equal(created.parent.data_source_id, "ds_1");
  assert.equal(records.get("p_1")!.rows.t9, named(calls, "pages.update").at(-1)!.args.page_id);
});

test("updateTaskStatus without a workspace throws", async () => {
  await assert.rejects(setup().sync.updateTaskStatus(project, "t1", "done"), /No Notion workspace/);
});

test("applyChanges sends one update per changed task", async () => {
  const { sync, calls } = setup();
  await sync.createWorkspace(project);
  const before = named(calls, "pages.update").length;
  await sync.applyChanges(project, [
    { taskId: "t2", field: "owner", from: "Jo", to: "Alex" },
    { taskId: "t2", field: "due", from: "2026-10-22", to: "2026-10-27" },
    { taskId: "t1", field: "owner", from: "Alex", to: null },
  ]);
  const updates = named(calls, "pages.update").slice(before).map((c) => c.args);
  assert.deepEqual(updates, [
    { page_id: "page_3", properties: { Owner: { select: { name: "Alex" } }, Due: { date: { start: "2026-10-27" } } } },
    { page_id: "page_2", properties: { Owner: { select: null } } },
  ]);
});

test("module functions explain missing .env settings", async () => {
  const saved = { token: process.env.NOTION_TOKEN, page: process.env.NOTION_PARENT_PAGE_ID };
  delete process.env.NOTION_TOKEN;
  delete process.env.NOTION_PARENT_PAGE_ID;
  try {
    await assert.rejects(createWorkspaceFromEnv(project), /NOTION_TOKEN and NOTION_PARENT_PAGE_ID/);
  } finally {
    if (saved.token !== undefined) process.env.NOTION_TOKEN = saved.token;
    if (saved.page !== undefined) process.env.NOTION_PARENT_PAGE_ID = saved.page;
  }
});

test("friendly() covers rate limits and plain errors", () => {
  assert.match(friendly({ code: "rate_limited" }), /Try again in a minute/);
  assert.equal(friendly(new Error("boom")), "boom");
});
