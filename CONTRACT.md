# API contract (frozen after the first 20 minutes)

The source of truth is the "API contract" section of `group-project-autopilot-plan.md`.
The zod schemas in `src/lib/schemas.ts` mirror it. If a field must change, say so out loud, then edit both.

Routes live under `/api` (e.g. `POST /api/projects`).
