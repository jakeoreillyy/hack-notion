// Role 4: live check against real Notion. Needs NOTION_TOKEN and NOTION_PARENT_PAGE_ID in .env.
// Run: npm run notion:smoke   (creates a small test workspace under your HQ page each time)
import type { Project } from "./schemas";
import { applyChanges, createWorkspace, updateTaskStatus } from "./lib/notionSync";

const line = "Students must analyse at least three competitors.";
const project: Project = {
  id: `smoke_${Date.now()}`,
  state: "confirmed",
  brief: `Smoke test ${new Date().toISOString().slice(0, 16).replace("T", " ")}\n${line}`,
  rubric: "Market analysis (25%)",
  deadline: "2026-11-06",
  members: [
    { name: "Alex", hoursPerWeek: 8, skills: ["research"], blocked: [] },
    { name: "Jo", hoursPerWeek: 10, skills: ["data"], blocked: [] },
  ],
  criteria: [{ id: "c1", name: "Market analysis", weight: 25 }],
  tasks: [
    { id: "t1", title: "Research competitors", criterionIds: ["c1"], owner: "Alex", estimateH: 4, confidence: "medium", start: "2026-10-12", due: "2026-10-14", dependsOn: [], status: "done", requiredSkills: ["research"], sourceLine: line },
    { id: "t2", title: "Analyse competitors", criterionIds: ["c1"], owner: "Jo", estimateH: 5, confidence: "low", start: "2026-10-19", due: "2026-10-22", dependsOn: ["t1"], status: "todo", requiredSkills: ["data"], sourceLine: line },
  ],
  notionUrl: null,
  proposals: {},
};

const url = await createWorkspace(project);
console.log(`1/3 workspace created: ${url}`);
await updateTaskStatus(project, "t2", "doing");
console.log('2/3 "Analyse competitors" set to Doing');
await applyChanges(project, [{ taskId: "t2", field: "owner", from: "Jo", to: "Alex" }]);
console.log('3/3 "Analyse competitors" moved to Alex');
console.log("Open the link and check the board, timeline and both pages. Delete the test page when done.");
