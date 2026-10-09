"use client";

// Role 3: plan review and dashboard
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { PlanView, Task } from "@contract";
import { Dashboard } from "@/components/Dashboard";
import { LoadBars } from "@/components/LoadBars";
import { WeekGrid } from "@/components/WeekGrid";
import { confirmPlan, getProject, updatePlan, USE_MOCK } from "@/lib/api";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    getProject(id).then(setPlan, (err) => setError(err instanceof Error ? err.message : "Could not load the plan."));
  }, [id]);

  if (error) return <Shell><p className="text-red-700">{error}</p></Shell>;
  if (!plan) return <Shell><p className="text-slate-500">Loading plan…</p></Shell>;

  const editTask = async (task: Task) => {
    const tasks = plan.tasks.map((t) => (t.id === task.id ? task : t));
    setPlan({ ...plan, tasks }); // show the edit straight away
    try {
      setPlan(await updatePlan(plan.projectId, tasks));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the change.");
    }
  };

  const confirm = async () => {
    setConfirming(true);
    try {
      setPlan(await confirmPlan(plan.projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the plan.");
    }
    setConfirming(false);
  };

  if (plan.state === "confirmed") {
    return (
      <Shell>
        <Warnings warnings={plan.warnings} />
        <Dashboard plan={plan} onPlanChange={setPlan} />
      </Shell>
    );
  }

  const members = plan.load.map((l) => l.member).sort();
  const tasksPerCriterion = (cid: string) => plan.tasks.filter((t) => t.criterionIds.includes(cid)).length;

  return (
    <Shell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Your draft plan</h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">Draft</span>
          </div>
          <p className="mt-1 text-slate-600">
            This is a starting point, not a decision. Edit anything below, then confirm as a team.
          </p>
        </div>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800">
          ← Start over
        </Link>
      </header>

      {USE_MOCK && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Using fake data from <code>mock/response.json</code>.
        </p>
      )}
      <Warnings warnings={plan.warnings} />

      {plan.coverageGaps.length > 0 && (
        <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">Some marks aren&apos;t covered by any task yet:</p>
          <ul className="mt-1 list-disc pl-5">
            {plan.coverageGaps.map((g) => {
              const weight = plan.criteria.find((c) => c.id === g.criterionId)?.weight;
              return (
                <li key={g.criterionId}>
                  {g.name}
                  {weight !== undefined && ` (${weight}%)`}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Marking criteria</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {plan.criteria.map((c) => {
              const n = tasksPerCriterion(c.id);
              return (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>
                    {c.name} <span className="text-slate-400">({c.weight}%)</span>
                  </span>
                  <span className={n === 0 ? "font-medium text-red-700" : "text-slate-500"}>
                    {n} {n === 1 ? "task" : "tasks"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Planned hours vs. available time</h2>
          <div className="mt-3">
            <LoadBars load={plan.load} />
          </div>
        </section>
      </div>

      {plan.risks.length > 0 && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Things to watch</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
            {plan.risks.map((r, i) => (
              <li key={i}>{r.detail}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-medium">Tasks by week ({plan.tasks.length})</h2>
        <p className="mt-1 text-sm text-slate-500">
          Estimates are guesses. Move tasks or change hours and the numbers above update.
        </p>
        <div className="mt-3">
          <WeekGrid tasks={plan.tasks} criteria={plan.criteria} members={members} onChange={editTask} />
        </div>
      </section>

      <div className="sticky bottom-0 mt-8 flex items-center justify-end gap-4 border-t border-slate-200 bg-slate-50/95 py-4 backdrop-blur">
        <p className="text-sm text-slate-500">Confirming opens the dashboard and builds your Notion workspace.</p>
        <button
          type="button"
          onClick={confirm}
          disabled={confirming}
          className="rounded-md bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {confirming ? "Confirming…" : "Confirm plan"}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 pt-10 text-slate-900">
      <div className="mx-auto max-w-5xl">{children}</div>
    </main>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="mt-4 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}
