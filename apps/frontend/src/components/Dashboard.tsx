"use client";

import { useEffect, useState } from "react";
import type { Notification, PlanView, ReplanProposal, Status, Task } from "@contract";
import { Avatar } from "@/components/Avatar";
import { LoadBars } from "@/components/LoadBars";
import { ReplanReview } from "@/components/ReplanReview";
import { confirmReplan, getNotifications, proposeReplan, setTaskStatus, type Unavailability } from "@/lib/api";
import { daysBetween, formatDay, todayISO } from "@/lib/dates";

const COLUMNS: { status: Status; label: string; dot: string }[] = [
  { status: "todo", label: "To do", dot: "bg-slate-400" },
  { status: "doing", label: "Doing", dot: "bg-amber-500" },
  { status: "done", label: "Done", dot: "bg-emerald-500" },
];

type Props = {
  plan: PlanView;
  onPlanChange: (plan: PlanView) => void;
};

export function Dashboard({ plan, onPlanChange }: Props) {
  const members = plan.load.map((l) => l.member).sort();
  const colorIndex = (name: string | null) => (name ? members.indexOf(name) : -1);
  const [me, setMe] = useState("");
  const [today, setToday] = useState(todayISO);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replan, setReplan] = useState<{ change: Unavailability; proposal: ReplanProposal } | null>(null);
  const [replanError, setReplanError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [updatedIds, setUpdatedIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getNotifications(plan.projectId, today).then(setNotifications, () =>
      setError("Could not load reminders."),
    );
  }, [plan, today]);

  const changeStatus = async (task: Task, status: Status) => {
    onPlanChange({ ...plan, tasks: plan.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) });
    try {
      onPlanChange(await setTaskStatus(plan.projectId, task.id, status));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the task.");
    }
  };

  const applyReplan = async () => {
    if (!replan) return;
    setApplying(true);
    try {
      const updated = await confirmReplan(plan.projectId, replan.proposal.proposalId);
      const ids = new Set(replan.proposal.changes.map((c) => c.taskId));
      onPlanChange(updated);
      setUpdatedIds(ids);
      setNotice(
        `Plan updated: ${ids.size} ${ids.size === 1 ? "task" : "tasks"} changed for ${replan.change.member}'s time off.`,
      );
      setReplan(null);
    } catch (err) {
      setReplanError(err instanceof Error ? err.message : "Could not update the plan.");
    }
    setApplying(false);
  };

  const sortByDue = (tasks: Task[]) => [...tasks].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  const count = (s: Status) => plan.tasks.filter((t) => t.status === s).length;
  const done = count("done");
  const total = plan.tasks.length || 1;
  const pctDone = Math.round((done / total) * 100);

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight">Project dashboard</h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
              Confirmed
            </span>
          </div>
          <p className="mt-1.5 text-slate-600">Update task status here. Notion follows automatically.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="label">
            I am
            <select className="input mt-1 w-40 py-2" value={me} onChange={(e) => setMe(e.target.value)}>
              <option value="">Everyone</option>
              {members.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          {plan.notionUrl && (
            <a href={plan.notionUrl} target="_blank" rel="noreferrer" className="btn-secondary py-2">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-900 text-[11px] font-bold text-white">
                N
              </span>
              Open in Notion ↗
            </a>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <div
          role="status"
          className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
        >
          <span className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">✓</span>
            {notice}
          </span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-900" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="card p-6 lg:col-span-2">
          <h2 className="section-title">Team progress</h2>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums tracking-tight">{pctDone}%</span>
            <span className="text-sm text-slate-500">
              {done} of {plan.tasks.length} tasks done
            </span>
          </p>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${(done / total) * 100}%` }} />
            <div className="bg-amber-400 transition-all duration-500" style={{ width: `${(count("doing") / total) * 100}%` }} />
          </div>
          <ul className="mt-3 flex gap-4 text-xs text-slate-600">
            {COLUMNS.map((c) => (
              <li key={c.status} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                {c.label} {count(c.status)}
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-6 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title flex items-center gap-2">
              Reminders
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  notifications.length ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"
                }`}
              >
                {notifications.length}
              </span>
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <label htmlFor="today">Today is</label>
              <input
                id="today"
                type="date"
                className="input w-40 py-1"
                value={today}
                onChange={(e) => e.target.value && setToday(e.target.value)}
              />
              {today !== todayISO() && (
                <button type="button" onClick={() => setToday(todayISO())} className="font-medium text-indigo-600 hover:underline">
                  Reset
                </button>
              )}
            </div>
          </div>
          {notifications.length === 0 ? (
            <p className="mt-4 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Nothing due in the next 2 days. 🎉
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {notifications.map((n) => (
                <li
                  key={n.taskId}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                    n.daysLeft < 0 ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"
                  } ${me && n.owner === me ? "ring-2 ring-indigo-400" : ""}`}
                >
                  <Avatar name={n.owner} colorIndex={colorIndex(n.owner)} size="sm" />
                  <span>
                    <span className="font-semibold">{n.owner}</span> · {n.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const tasks = sortByDue(plan.tasks.filter((t) => t.status === col.status));
          return (
            <div key={col.status} className="rounded-2xl bg-slate-200/50 p-3">
              <h2 className="flex items-center gap-2 px-1.5 py-1 text-sm font-semibold text-slate-700">
                <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                {col.label}
                <span className="font-normal text-slate-400">{tasks.length}</span>
              </h2>
              <ul className="mt-2 space-y-2">
                {tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    today={today}
                    colorIndex={colorIndex(t.owner)}
                    mine={!!me && t.owner === me}
                    updated={updatedIds.has(t.id)}
                    onStatus={changeStatus}
                  />
                ))}
                {tasks.length === 0 && (
                  <li className="rounded-xl border-2 border-dashed border-slate-300/70 px-3 py-6 text-center text-xs text-slate-400">
                    Nothing here
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="section-title">Planned hours vs. available time</h2>
          <div className="mt-4">
            <LoadBars load={plan.load} />
          </div>
        </section>
        <UnavailableForm
          projectId={plan.projectId}
          members={members}
          onProposal={(change, proposal) => {
            setReplanError(null);
            setReplan({ change, proposal });
          }}
        />
      </div>

      {replan && (
        <ReplanReview
          plan={plan}
          change={replan.change}
          proposal={replan.proposal}
          busy={applying}
          error={replanError}
          onConfirm={applyReplan}
          onCancel={() => setReplan(null)}
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  today,
  colorIndex,
  mine,
  updated,
  onStatus,
}: {
  task: Task;
  today: string;
  colorIndex: number;
  mine: boolean;
  updated: boolean;
  onStatus: (task: Task, status: Status) => void;
}) {
  const overdue = task.status !== "done" && task.due !== null && daysBetween(today, task.due) < 0;
  const isDone = task.status === "done";

  return (
    <li
      className={`rounded-xl border bg-white p-3.5 text-sm shadow-xs transition hover:shadow-sm ${
        mine ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-semibold leading-snug ${isDone ? "text-slate-400 line-through decoration-slate-300" : "text-slate-800"}`}>
          {task.title}
        </p>
        {updated && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
            Updated
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <Avatar name={task.owner ?? "?"} colorIndex={colorIndex} size="sm" />
        <span className="font-medium text-slate-600">{task.owner ?? "Unassigned"}</span>
        <span>·</span>
        <span>{task.estimateH} h</span>
        {task.due && (
          <span
            className={`ml-auto rounded-md px-1.5 py-0.5 ${
              overdue ? "bg-red-50 font-semibold text-red-700" : "bg-slate-100 text-slate-600"
            }`}
          >
            {overdue ? "Overdue · " : ""}
            {formatDay(task.due)}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-0.5 rounded-lg bg-slate-100 p-0.5" role="group" aria-label={`Status of ${task.title}`}>
        {COLUMNS.map((c) => {
          const active = task.status === c.status;
          return (
            <button
              key={c.status}
              type="button"
              aria-pressed={active}
              onClick={() => !active && onStatus(task, c.status)}
              className={`rounded-md py-1 text-xs font-medium transition ${
                active ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </li>
  );
}

function UnavailableForm({
  projectId,
  members,
  onProposal,
}: {
  projectId: string;
  members: string[];
  onProposal: (change: Unavailability, proposal: ReplanProposal) => void;
}) {
  const [member, setMember] = useState(members[0] ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || !from || !to) return setError("Pick a person and both dates.");
    if (to < from) return setError("The end date must be on or after the start date.");
    setError(null);
    setBusy(true);
    try {
      const change = { member, from, to };
      onProposal(change, await proposeReplan(projectId, change));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not work out a new plan.");
    }
    setBusy(false);
  };

  return (
    <section className="card p-6">
      <h2 className="section-title">Someone can&apos;t work for a while?</h2>
      <p className="mt-0.5 text-sm text-slate-500">
        We&apos;ll suggest a new plan. Nothing changes until you confirm it.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <label className="label block">
          Who
          <select className="input mt-1" value={member} onChange={(e) => setMember(e.target.value)}>
            {members.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-3">
          <label className="label block flex-1">
            From
            <input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="label block flex-1">
            To
            <input
              type="date"
              className="input mt-1"
              min={from || undefined}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Working it out…
            </>
          ) : (
            "Suggest a new plan"
          )}
        </button>
      </form>
    </section>
  );
}
