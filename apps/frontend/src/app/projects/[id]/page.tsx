"use client";

// Role 3: plan review and dashboard
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { PlanView, Task } from "@contract";
import { AppHeader } from "@/components/AppHeader";
import { Dashboard } from "@/components/Dashboard";
import { LoadBars } from "@/components/LoadBars";
import { WeekGrid } from "@/components/WeekGrid";
import { confirmPlan, getProject, updatePlan } from "@/lib/api";
import { criterionColor } from "@/lib/colors";
import { mondayOf } from "@/lib/dates";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Edits save on every change; only the reply to the latest save may replace the plan.
  const saveSeq = useRef(0);

  useEffect(() => {
    getProject(id).then(setPlan, (err) => setError(err instanceof Error ? err.message : "Could not load the plan."));
  }, [id]);

  if (!plan) {
    return (
      <Shell step={2}>
        {error ? (
          <p className="rounded-[4px] border-l-4 border-margin bg-white px-4 py-3 text-sm text-red-800">{error}</p>
        ) : (
          <p className="flex items-center gap-2 text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden />
            Loading plan…
          </p>
        )}
      </Shell>
    );
  }

  const editTask = async (task: Task) => {
    const tasks = plan.tasks.map((t) => (t.id === task.id ? task : t));
    setPlan({ ...plan, tasks }); // show the edit straight away
    const seq = ++saveSeq.current;
    try {
      const saved = await updatePlan(plan.projectId, tasks);
      if (seq === saveSeq.current) {
        setPlan(saved);
        setError(null);
      }
    } catch (err) {
      if (seq === saveSeq.current) setError(err instanceof Error ? err.message : "Could not save the change.");
    }
  };

  const confirm = async () => {
    setConfirming(true);
    try {
      setPlan(await confirmPlan(plan.projectId));
      window.scrollTo({ top: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the plan.");
    }
    setConfirming(false);
  };

  if (plan.state === "confirmed") {
    return (
      <Shell step={3}>
        <Warnings warnings={plan.warnings} />
        <Dashboard plan={plan} onPlanChange={setPlan} />
      </Shell>
    );
  }

  const members = plan.load.map((l) => l.member).sort();
  const tasksPerCriterion = (cid: string) => plan.tasks.filter((t) => t.criterionIds.includes(cid)).length;
  const weekCount = new Set(plan.tasks.filter((t) => t.due).map((t) => mondayOf(t.due!))).size;
  const totalHours = plan.tasks.reduce((sum, t) => sum + t.estimateH, 0);
  const covered = plan.criteria.length - plan.coverageGaps.length;

  return (
    <Shell step={2}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-4xl sm:text-5xl">Your draft plan</h1>
            <span className="-rotate-3 rounded-[3px] border-2 border-amber-600 px-2 py-0.5 text-sm font-extrabold text-amber-700">Draft</span>
          </div>
          <p className="mt-2 text-slate-600">
            A starting point, not a decision. Move things around, then confirm as a team.
          </p>
        </div>
        <Link href="/" className="btn-secondary">
          ← Start over
        </Link>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-[4px] border-l-4 border-margin bg-white px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <Warnings warnings={plan.warnings} />

      <dl className="card mt-8 grid grid-cols-2 gap-px overflow-hidden bg-rule md:grid-cols-4">
        <Stat label="Tasks" value={plan.tasks.length} />
        <Stat label="Weeks" value={weekCount} />
        <Stat label="Total hours" value={+totalHours.toFixed(1)} />
        <Stat
          label="Marks covered"
          value={`${covered} / ${plan.criteria.length}`}
          tone={plan.coverageGaps.length > 0 ? "warn" : "ok"}
        />
      </dl>

      {plan.coverageGaps.length > 0 && (
        <div className="mt-4 flex gap-3 rounded-[4px] border-l-4 border-margin bg-white px-5 py-4 text-sm text-red-900 shadow-[0_1px_0_var(--color-rule)]">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] bg-margin text-xs font-bold text-white">
            !
          </span>
          <div>
            <p className="font-semibold">Some marks aren&apos;t covered by any task yet</p>
            <p className="mt-0.5 text-red-800">
              {plan.coverageGaps
                .map((g) => {
                  const weight = plan.criteria.find((c) => c.id === g.criterionId)?.weight;
                  return weight !== undefined ? `${g.name} (${weight}%)` : g.name;
                })
                .join(", ")}
              . Add a task for {plan.coverageGaps.length === 1 ? "it" : "them"} or you could lose these marks.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="section-title">Marking criteria</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {plan.criteria.map((c, i) => {
              const n = tasksPerCriterion(c.id);
              return (
                <li key={c.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium text-slate-800">
                      <span className={`h-2.5 w-2.5 rounded-full ${criterionColor(i).dot}`} />
                      {c.name}
                    </span>
                    <span className={n === 0 ? "text-xs font-semibold text-red-600" : "text-xs text-slate-500"}>
                      {n === 0 ? "No tasks" : `${n} ${n === 1 ? "task" : "tasks"}`}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-[1px] bg-slate-100">
                      <div className={`h-full ${criterionColor(i).dot}`} style={{ width: `${c.weight}%` }} />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-slate-500">{c.weight}%</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card p-6">
          <h2 className="section-title">Planned hours vs. available time</h2>
          <p className="mt-0.5 text-xs text-slate-500">Based on each person&apos;s weekly hours and days off.</p>
          <div className="mt-4">
            <LoadBars load={plan.load} />
          </div>
        </section>
      </div>

      {plan.risks.length > 0 && (
        <section className="card mt-6 p-6">
          <h2 className="section-title">Things to watch</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {plan.risks.map((r, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-0.5 text-amber-500" aria-hidden>
                  ▲
                </span>
                {r.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mt-6 p-6">
        <h2 className="section-title">Tasks by week</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Estimates are guesses. Move tasks or change hours and the numbers above update.
        </p>
        <div className="mt-4">
          <WeekGrid tasks={plan.tasks} criteria={plan.criteria} members={members} onChange={editTask} />
        </div>
      </section>

      <div className="sticky bottom-4 z-20 mt-8">
        <div className="card flex flex-wrap items-center justify-between gap-4 border-slate-900 px-6 py-4 shadow-[0_10px_30px_-12px_rgb(21_32_56/0.35)]">
          <p className="text-sm text-slate-600">
            Happy with it? Confirming opens your dashboard and builds the Notion workspace.
          </p>
          <button type="button" onClick={confirm} disabled={confirming} className="btn-primary px-6">
            {confirming ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Confirming…
              </>
            ) : (
              "Confirm plan"
            )}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ step, children }: { step: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <>
      <AppHeader step={step} />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-10">{children}</main>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" }) {
  return (
    <div className="bg-white px-5 py-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd
        className={`mt-0.5 text-3xl font-extrabold tabular-nums tracking-[-0.03em] ${
          tone === "warn" ? "text-margin" : tone === "ok" ? "text-emerald-700" : "text-slate-900"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="mb-6 space-y-1 rounded-[4px] border-l-4 border-amber-500 bg-amber-50 px-5 py-3 text-sm text-amber-900">
      {warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}
