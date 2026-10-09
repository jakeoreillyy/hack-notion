# API contract (frozen after the first 20 minutes)

Source of truth: the "API contract" section of `group-project-autopilot-plan.md`.
Types: `apps/backend/src/schemas.ts` (the frontend imports them as `@contract`, types only).
Routes are served by `apps/backend` under `/api`; the frontend proxies `/api/*` to it.
