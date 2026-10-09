"use client";

// Screen 4: before/after view of a replan proposal. Nothing changes until Confirm.
import { useEffect } from "react";
import type { Change, Load, PlanView, ReplanProposal } from "@contract";
import { Avatar } from "@/components/Avatar";
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
  // loadAfter only lists members whose numbers changed; everyone else keeps their current load.
  const after = new Map(proposal.loadAfter.map((l) => [l.member, l]));
  const members = plan.load
    .map((l) => after.get(l.member) ?? l)
    .concat(proposal.loadAfter.filter((l) => !before.has(l.member)))
    .sort((a, b) => a.member.localeCompare(b.member));
  const colorIndex = (name: string) => members.findIndex((m) => m.member === name);
  const nothingChanges = proposal.changes.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 px-4 py-10 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="replan-title"
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/20"
      >
        <div className="flex items-center gap-4 border-b border-slate-200 bg-gradient-to-br from-indigo-50 to-white px-6 py-5">
          <Avatar name={change.member} colorIndex={colorIndex(change.member)} size="lg" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Suggested new plan</p>
            <h2 id="replan-title" className="mt-0.5 text-lg font-bold tracking-tight">
              {change.member} can&apos;t work {formatDay(change.from)} – {formatDay(change.to)}
            </h2>
          </div>
        </div>

        <div className="space-y-6 px-6 py-5">
          <p className="border-l-4 border-indigo-300 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
            {proposal.explanation}
          </p>

          {proposal.warnings.length > 0 && (
            <ul className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {proposal.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {!nothingChanges && (
            <section>
              <h3 className="section-title text-sm">
                What changes ({byTask.size} {byTask.size === 1 ? "task" : "tasks"})
              </h3>
              <ul className="mt-3 space-y-2">
                {[...byTask].map(([taskId, changes]) => (
                  <li key={taskId} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
                    <p className="font-semibold text-slate-800">{taskTitle(taskId)}</p>
                    {changes.map((c) => (
                      <div key={c.field} className="mt-2 flex flex-wrap items-center gap-2 text-slate-600">
                        <span className="w-10 text-xs text-slate-400">{FIELD_LABEL[c.field]}</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 py-0.5 pl-1 pr-2.5 text-red-800 line-through decoration-red-300">
                          {c.field === "owner" && c.from && <Avatar name={c.from} colorIndex={colorIndex(c.from)} size="sm" />}
                          {showValue(c.field, c.from)}
                        </span>
                        <span aria-hidden className="text-slate-400">
                          →
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 py-0.5 pl-1 pr-2.5 font-semibold text-emerald-800">
                          {c.field === "owner" && c.to && <Avatar name={c.to} colorIndex={colorIndex(c.to)} size="sm" />}
                          {showValue(c.field, c.to)}
                        </span>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="section-title text-sm">Hours before → after</h3>
            <ul className="mt-3 space-y-3">
              {members.map((after, i) => (
                <LoadRow key={after.member} before={before.get(after.member)} after={after} colorIndex={i} />
              ))}
            </ul>
          </section>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          {!nothingChanges && (
            <p className="mr-auto text-xs text-slate-500">Confirming updates the plan and your Notion board.</p>
          )}
          <button type="button" onClick={onCancel} disabled={busy} className="btn-secondary">
            {nothingChanges ? "Close" : "Cancel"}
          </button>
          {!nothingChanges && (
            <button type="button" onClick={onConfirm} disabled={busy} autoFocus className="btn-primary">
              {busy ? "Updating…" : "Confirm changes ✓"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadRow({ before, after, colorIndex }: { before: Load | undefined; after: Load; colorIndex: number }) {
  const changed = !before || before.plannedH !== after.plannedH || before.availableH !== after.availableH;
  const pct = (l: Load) => (l.availableH > 0 ? Math.min(100, (l.plannedH / l.availableH) * 100) : 100);
  const over = (l: Load) => l.plannedH > l.availableH;
  const label = (l: Load) => `${+l.plannedH.toFixed(1)} / ${l.availableH} h`;

  return (
    <li className={`flex items-center gap-3 ${changed ? "" : "opacity-45"}`}>
      <Avatar name={after.member} colorIndex={colorIndex} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex justify-between gap-2 text-sm">
          <span className="font-medium text-slate-800">{after.member}</span>
          <span className="tabular-nums text-slate-500">
            {before && changed && (
              <>
                <span className={over(before) ? "text-red-600" : ""}>{label(before)}</span> →{" "}
              </>
            )}
            <span className={over(after) ? "font-semibold text-red-600" : changed ? "font-semibold text-slate-900" : ""}>
              {label(after)}
            </span>
          </span>
        </div>
        <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
          {before && changed && (
            <div className="absolute h-full rounded-full bg-slate-300" style={{ width: `${pct(before)}%` }} />
          )}
          <div
            className={`absolute h-full rounded-full transition-all ${over(after) ? "bg-red-500" : "bg-indigo-500"}`}
            style={{ width: `${pct(after)}%` }}
          />
        </div>
      </div>
    </li>
  );
}
