"use client";

// Screen 4: before/after view of a replan proposal. Nothing changes until Confirm.
import { useEffect } from "react";
import type { Change, Load, PlanView, ReplanProposal } from "@contract";
import type { Unavailability } from "@/lib/api";
import { formatDay } from "@/lib/dates";

type Props = {
  plan: PlanView;
  change: Unavailability;
  proposal: ReplanProposal;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

const FIELD_LABEL: Record<Change["field"], string> = { owner: "Who", start: "Start", due: "Due" };

export function ReplanReview({ plan, change, proposal, busy, error, onConfirm, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const taskTitle = (id: string) => plan.tasks.find((t) => t.id === id)?.title ?? id;
  const showValue = (field: Change["field"], value: string | null) =>
    value === null ? "None" : field === "owner" ? value : formatDay(value);

  // Group changes by task so each task appears once.
  const byTask = new Map<string, Change[]>();
  for (const c of proposal.changes) byTask.set(c.taskId, [...(byTask.get(c.taskId) ?? []), c]);

  const before = new Map(plan.load.map((l) => [l.member, l]));
  const members = [...proposal.loadAfter].sort((a, b) => a.member.localeCompare(b.member));
  const nothingChanges = proposal.changes.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="replan-title"
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
      >
        <div className="border-b border-slate-200 px-6 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">Suggested new plan</p>
          <h2 id="replan-title" className="mt-1 text-lg font-semibold">
            {change.member} can&apos;t work {formatDay(change.from)} – {formatDay(change.to)}
          </h2>
        </div>

        <div className="space-y-6 px-6 py-5">
          <p className="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-700">{proposal.explanation}</p>

          {proposal.warnings.length > 0 && (
            <ul className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {proposal.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {!nothingChanges && (
            <section>
              <h3 className="text-sm font-medium">
                What changes ({byTask.size} {byTask.size === 1 ? "task" : "tasks"})
              </h3>
              <ul className="mt-2 space-y-2">
                {[...byTask].map(([taskId, changes]) => (
                  <li key={taskId} className="rounded-md border border-slate-200 px-4 py-3 text-sm">
                    <p className="font-medium">{taskTitle(taskId)}</p>
                    {changes.map((c) => (
                      <p key={c.field} className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
                        <span className="w-12 text-xs text-slate-400">{FIELD_LABEL[c.field]}</span>
                        <span className="rounded bg-red-50 px-2 py-0.5 text-red-800 line-through decoration-red-300">
                          {showValue(c.field, c.from)}
                        </span>
                        <span aria-hidden>→</span>
                        <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-800">
                          {showValue(c.field, c.to)}
                        </span>
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-sm font-medium">Hours before → after</h3>
            <ul className="mt-2 space-y-3">
              {members.map((after) => (
                <LoadRow key={after.member} before={before.get(after.member)} after={after} />
              ))}
            </ul>
          </section>

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          {!nothingChanges && (
            <p className="mr-auto text-xs text-slate-500">Confirming updates the plan and your Notion board.</p>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {nothingChanges ? "Close" : "Cancel"}
          </button>
          {!nothingChanges && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              autoFocus
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy ? "Updating…" : "Confirm changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadRow({ before, after }: { before: Load | undefined; after: Load }) {
  const changed = !before || before.plannedH !== after.plannedH || before.availableH !== after.availableH;
  const pct = (l: Load) => (l.availableH > 0 ? Math.min(100, (l.plannedH / l.availableH) * 100) : 100);
  const over = (l: Load) => l.plannedH > l.availableH;
  const label = (l: Load) => `${+l.plannedH.toFixed(1)} / ${l.availableH} h`;

  return (
    <li className={changed ? "" : "opacity-50"}>
      <div className="flex justify-between text-sm">
        <span className="font-medium">{after.member}</span>
        <span className="text-slate-500">
          {before && changed && (
            <>
              <span className={over(before) ? "text-red-700" : ""}>{label(before)}</span> →{" "}
            </>
          )}
          <span className={over(after) ? "font-medium text-red-700" : changed ? "font-medium text-slate-800" : ""}>
            {label(after)}
          </span>
        </span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-slate-200">
        {before && changed && (
          <div className="absolute h-2 rounded-full bg-slate-400/50" style={{ width: `${pct(before)}%` }} />
        )}
        <div
          className={`absolute h-2 rounded-full ${over(after) ? "bg-red-500" : "bg-indigo-500"}`}
          style={{ width: `${pct(after)}%` }}
        />
      </div>
    </li>
  );
}
