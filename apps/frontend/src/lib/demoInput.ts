// Role 3: sample input for the "Fill with demo data" button. Matches the team in mock/response.json.
// Swap in Role 5's /demo files once they exist.
import type { CreateProjectRequest } from "@contract";

export const DEMO_INPUT: CreateProjectRequest = {
  brief: `MK301 Marketing Group Project

Each group will produce a 2,500-word marketing report on a brand of their choice and deliver a 10-minute presentation of their findings.

Students must analyse at least three competitors. The report should estimate the size of the target market using published data. Include primary research with at least 20 respondents. Findings should be supported with clear charts or tables.

Present a SWOT analysis of the chosen brand. Identify and justify two target segments. Recommend a marketing mix for the next 12 months.

The report must be 2,500 words with a clear introduction and conclusion. Use Harvard referencing throughout. All members must take part in the presentation.`,
  rubric: `Market analysis (25%): depth and accuracy of competitor and market research.
Marketing strategy (25%): quality and justification of SWOT, segmentation and marketing mix.
Critical evaluation of sources (15%): sources are assessed for reliability and bias.
Report structure and writing (20%): clarity, structure and accurate referencing.
Presentation delivery (15%): clear, well-timed delivery with every member taking part.`,
  deadline: "2026-11-06",
  members: [
    { name: "Alex", hoursPerWeek: 8, skills: ["research", "writing"], blocked: ["2026-10-20"] },
    { name: "Ciara", hoursPerWeek: 6, skills: ["editing", "presenting"], blocked: [] },
    { name: "Jo", hoursPerWeek: 5, skills: ["research", "data", "writing"], blocked: [] },
    { name: "Priya", hoursPerWeek: 6, skills: ["data", "design"], blocked: [] },
    { name: "Sam", hoursPerWeek: 4, skills: ["research", "writing"], blocked: ["2026-10-27"] },
  ],
};
