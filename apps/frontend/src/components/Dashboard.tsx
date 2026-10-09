"use client";

import { useEffect, useState } from "react";
import type { Notification, PlanView, ReplanProposal, Status, Task } from "@contract";
import { LoadBars } from "@/components/LoadBars";
import { ReplanReview } from "@/components/ReplanReview";
import {
  confirmReplan,
  getNotifications,
  proposeReplan,
  setTaskStatus,
  USE_MOCK,
  type Unavailability,
} from "@/lib/api";
import { daysBetween, formatDay, todayISO } from "@/lib/dates";

const COLUMNS: { status: Status; label: string }[] = [
  { status: "todo", label: "To do" },
  { status: "doing", label: "Doing" },
  { status: "done", label: "Done" },
];

type Props = {
  plan: PlanView;
  onPlanChange: (plan: PlanView) => void;
};

export function Dashboard({ plan, onPlanChange }: Props) {
  const members = plan.load.map((l) => l.member).sort();
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

  const sortByDue =(tasks: Task[]) => [...tasks].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Project dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">
            Update task status here. Notion follows automatically.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-slate-500">
            I am
            <select className="input mt-1 w-36 py-1.5" value={me} onChange={(e) => setMe(e.target.value)}>
              <option value="">Everyone</option>
              {members.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          {plan.notionUrl && (
            <a
              href={plan.notionUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Open in Notion ↗
            </a>
          )}
        </div>
      </header>

      {USE_MOCK && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Using fake data from <code>mock/response.json</code>.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <div
          role="status"
          className="mt-4 flex items-start justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
        >
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-emerald-600 hover:text-emerald-900" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">
            Reminders <span className="text-slate-400">({notifications.length})</span>
          </h2>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <label htmlFor="today">Today is</label>
            <input
              id="today"
              type="date"
              className="input w-40 py-1"
              value={today}
              onChange={(e) => e.target.value && setToday(e.target.value)}
            />
            {today !== todayISO() && (
              <button type="button" onClick={() => setToday(todayISO())} className="text-indigo-700 hover:underline">
                Reset
              </button>
            )}
          </div>
        </div>
        {notifications.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing due in the next 2 days.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {notifications.map((n) => (
              <li
                key={n.taskId}
                className={`flex items-start gap-3 rounded-md px-3 py-2 text-sm ${
                  n.daysLeft < 0 ? "bg-red-50 text-red-900" : "bg-amber-50 text-amber-900"
                } ${me && n.owner === me ? "ring-2 ring-indigo-500" : ""}`}
              >
                <span className="font-medium">{n.owner}</span>
                <span>{n.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const tasks = sortByDue(plan.tasks.filter((t) => t.status === col.status));
          return (
            <div key={col.status} className="rounded-lg bg-slate-100 p-3">
              <h2 className="px-1 text-sm font-medium text-slate-600">
                {col.label} <span className="text-slate-400">({tasks.length})</span>
              </h2>
              <ul className="mt-2 space-y-2">
                {tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    today={today}
                    mine={!!me && t.owner === me}
                    updated={updatedIds.has(t.id)}
                    onStatus={changeStatus}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <div className="mt-6 grid gap-6 pb-10 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="font-medium">Planned hours vs. available time</h2>
          <div className="mt-3">
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
  mine,
  updated,
  onStatus,
}: {
  task: Task;
  today: string;
  mine: boolean;
  updated: boolean;
  onStatus: (task: Task, status: Status) => void;
}) {
  const overdue = task.status !== "done" && task.due !== null && daysBetween(today, task.due) < 0;

  return (
    <li
      className={`rounded-md border bg-white p-3 text-sm shadow-sm ${
        mine ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-200"
      } ${task.status === "done" ? "opacity-70" : ""}`}
    >
      <p className={`font-medium ${task.status === "done" ? "line-through decoration-slate-400" : ""}`}>
        {task.title}
        {updated && (
          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 align-middle text-xs font-normal text-emerald-800">
            Updated
          </span>
        )}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {task.owner ?? "Unassigned"} · {task.estimateH} h
        {task.due && (
          <>
            {" · "}
            <span className={overdue ? "font-medium text-red-700" : ""}>Due {formatDay(task.due)}</span>
          </>
        )}
      </p>
      <div className="mt-2 flex gap-1" role="group" aria-label={`Status of ${task.title}`}>
        {COLUMNS.map((c) => (
          <button
            key={c.status}
            type="button"
            aria-pressed={task.status === c.status}
            onClick={() => task.status !== c.status && onStatus(task, c.status)}
            className={`rounded px-2 py-0.5 text-xs ${
              task.status === c.status
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {c.label}
          </button>
        ))}
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
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="font-medium">Someone can&apos;t work for a while?</h2>
      <p className="mt-1 text-sm text-slate-500">
        We&apos;ll suggest a new plan. Nothing changes until you confirm it.
      </p>
      <form onSubmit={submit} className="mt-3 space-y-3" noValidate>
        <label className="block text-xs font-medium text-slate-500">
          Who
          <select className="input mt-1" value={member} onChange={(e) => setMember(e.target.value)}>
            {members.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-3">
          <label className="block flex-1 text-xs font-medium text-slate-500">
            From
            <input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block flex-1 text-xs font-medium text-slate-500">
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
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {busy ? "Working it out…" : "Suggest a new plan"}
        </button>
      </form>
    </section>
  );
}
