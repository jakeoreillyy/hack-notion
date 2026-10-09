// Role 3: sample input for the "Fill with demo data" button.
// Matches the MK301 demo project in apps/backend/src/lib/fixtures/project.json.
import type { CreateProjectRequest } from "@contract";

export const DEMO_PROJECT_ID = "p_mk301";

export const DEMO_INPUT: CreateProjectRequest = {
  brief: `MK301 Marketing Strategy: Group Assignment
Your group will act as a marketing consultancy for a new plant-based snack brand entering the UK market.
Submit a 2,500-word group report and deliver a 10-minute presentation by 6 November 2026.
Students must analyse at least three competitors.
Conduct a short customer survey (minimum 30 responses) and analyse the results.
Identify and describe the target market segments, using market size data where available.
Recommend a marketing mix (4Ps) with justification.
Support all claims with academic and industry sources, referenced in Harvard style.
The report must include an executive summary, introduction, analysis, recommendations and conclusion.
Each member must submit a 300-word individual reflection on teamwork.`,
  rubric: `Market analysis (25%): depth of competitor and customer analysis.
Strategy and recommendations (20%): quality and justification of the marketing mix.
Report structure and writing quality (15%): clear structure, concise academic writing.
Critical evaluation of sources (15%): sources are assessed, not just cited.
Presentation delivery (15%): clear, well-timed, engaging presentation.
Teamwork and reflection (10%): evidence of collaboration and individual reflection.`,
  deadline: "2026-11-06",
  members: [
    { name: "Alex", hoursPerWeek: 8, skills: ["research", "writing"], blocked: ["2026-10-20"] },
    { name: "Jo", hoursPerWeek: 10, skills: ["research", "data", "writing", "presenting"], blocked: [] },
    { name: "Mia", hoursPerWeek: 3, skills: ["editing", "writing"], blocked: ["2026-10-29", "2026-10-30"] },
    { name: "Ravi", hoursPerWeek: 8, skills: ["design", "writing", "coding", "presenting"], blocked: ["2026-10-13"] },
    { name: "Sam", hoursPerWeek: 6, skills: ["research", "data"], blocked: [] },
  ],
};
