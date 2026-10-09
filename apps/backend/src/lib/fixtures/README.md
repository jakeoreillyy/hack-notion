# MK301 fixtures (Role 2)

Hand-written demo data. Deadline `2026-11-06` (Fri), so with the 2 working-day buffer the last normal due date is `2026-11-04`.

- `project.json`: a full `Project` record, hand-scheduled (not scheduler output). Use it for the skeleton endpoints, `analyse()` and `proposeReplan()`.
- `tasks.json`: the same 21 tasks as Role 1's `decompose()` would return them: `owner`, `start` and `due` are `null`, all `todo`. Use it as `schedule()` input. Generated from `project.json`, so if you edit tasks, edit both.

## Deliberate scenarios

| Scenario | Where | What should happen |
| --- | --- | --- |
| Overload | Mia is the only `editing` member, 3 h/week with 2 blocked weekdays: 10.8 h available, 14 h planned | `analyse()` reports Mia over capacity; `schedule()` can't avoid it either |
| Coverage gap | `c4` "Critical evaluation of sources" has no task (`t15` formats references but is tagged `c3`) | `coverageGaps` contains `c4` |
| Low slack | `t19` "Rehearse presentation" is due `2026-11-05`, inside the buffer | a `low_slack` risk |
| Sam replan | `{ member: "Sam", from: "2026-10-20", to: "2026-10-24" }` | Sam's `t4`, `t6`, `t7` overlap the window. `t2` (done), `t3` (doing) and `t21` (after the window) must not change. Jo is the only other member with `data`, so the result is: t4 and t6 move to Jo, t7 stays with Sam but is due `10-27` instead of `10-21` (3 changes, asserted in `engine.test.ts`) |

Other details worth testing against: Alex is blocked `2026-10-20` (so he can't take Sam's research tasks that day), Ravi is blocked `2026-10-13`, and every `sourceLine` is a verbatim line from `brief`.
