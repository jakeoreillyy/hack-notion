"use client";

// Week-by-person view of the plan. A task sits in the week of its due date.
// Moving a task to a week sets start = that Monday and due = that Friday, so the contract's dates still hold.
import { useState } from "react";
import type { Criterion, Task } from "@contract";
import { Avatar } from "@/components/Avatar";
import { criterionColor } from "@/lib/colors";
import { addDays, formatShort, mondayOf } from "@/lib/dates";

type Props = {
  tasks: Task[];
  criteria: Criterion[];
  members: string[];
  onChange: (task: Task) => void;
};

export function WeekGrid({ tasks, criteria, members, onChange }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropCell, setDropCell] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dated = tasks.filter((t) => t.due);
  if (dated.length === 0) return <p className="text-sm text-slate-500">No tasks have dates yet.</p>;

  const firstWeek = mondayOf(dated.map((t) => t.start ?? t.due!).sort()[0]);
  const lastWeek = mondayOf(dated.map((t) => t.due!).sort().at(-1)!);
  const weeks: string[] = [];
  for (let w = firstWeek; w <= lastWeek; w = addDays(w, 7)) weeks.push(w);
  const weekRange = (w: string) => `${formatShort(w)} – ${formatShort(addDays(w, 4))}`;
  const weekLabel = (w: string) => `Week ${weeks.indexOf(w) + 1} · ${weekRange(w)}`;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const criterionIndex = (t: Task) => criteria.findIndex((c) => c.id === t.criterionIds[0]);
  const rows: (string | null)[] = tasks.some((t) => !t.owner) ? [...members, null] : members;
  const cellKey = (owner: string | null, week: string) => `${owner ?? ""}|${week}`;
  const cellTasks = (owner: string | null, week: string) =>
    tasks.filter((t) => t.owner === owner && t.due && mondayOf(t.due) === week);

  // Dependencies that finish after this task is due.
  const lateDeps = (t: Task) =>
    t.dependsOn.map((id) => byId.get(id)).filter((d): d is Task => !!d?.due && !!t.due && d.due > t.due);

  const move = (task: Task, owner: string | null, week: string) => {
    if (task.owner === owner && task.due && mondayOf(task.due) === week) return;
    onChange({ ...task, owner, start: week, due: addDays(week, 4) });
  };

  const selected = selectedId ? byId.get(selectedId) : undefined;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <div
          className="grid min-w-max text-sm"
          style={{ gridTemplateColumns: `9rem repeat(${weeks.length}, minmax(12rem, 1fr))` }}
        >
          <div className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50" />
          {weeks.map((w, i) => (
            <div key={w} className="border-b border-l border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-xs font-semibold text-slate-700">Week {i + 1}</p>
              <p className="text-xs text-slate-400">{weekRange(w)}</p>
            </div>
          ))}

          {rows.map((owner) => (
            <Row key={owner ?? "unassigned"}>
              <div className="sticky left-0 z-10 flex items-start gap-2 border-b border-slate-100 bg-white px-3 py-3">
                <Avatar name={owner ?? "?"} colorIndex={owner ? members.indexOf(owner) : -1} size="sm" />
                <span className={`pt-0.5 font-medium ${owner ? "text-slate-800" : "text-slate-400"}`}>
                  {owner ?? "Unassigned"}
                </span>
              </div>
              {weeks.map((w) => {
                const key = cellKey(owner, w);
                const items = cellTasks(owner, w);
                const hours = items.reduce((sum, t) => sum + t.estimateH, 0);
                return (
                  <div
                    key={key}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropCell(key);
                    }}
                    onDragLeave={() => setDropCell((c) => (c === key ? null : c))}
                    onDrop={() => {
                      const task = dragId ? byId.get(dragId) : undefined;
                      if (task) move(task, owner, w);
                      setDragId(null);
                      setDropCell(null);
                    }}
                    className={`min-h-24 space-y-1.5 border-b border-l border-slate-100 p-2 transition-colors ${
                      dropCell === key ? "bg-indigo-50 ring-2 ring-inset ring-indigo-300" : "bg-white"
                    }`}
                  >
                    {items.length > 0 && (
                      <p className="pr-0.5 text-right text-[11px] font-medium tabular-nums text-slate-400">{hours} h</p>
                    )}
                    {items.map((t) => {
                      const late = lateDeps(t);
                      const isSelected = t.id === selectedId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          draggable
                          onDragStart={() => setDragId(t.id)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => setSelectedId(isSelected ? null : t.id)}
                          title={late.length ? `Starts before "${late[0].title}" is due` : `From the brief: "${t.sourceLine}"`}
                          className={`block w-full cursor-grab rounded-lg border border-l-4 px-2.5 py-2 text-left text-xs shadow-xs transition active:cursor-grabbing ${
                            criterionColor(criterionIndex(t)).edge
                          } ${
                            isSelected
                              ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200"
                              : late.length
                                ? "border-amber-300 bg-amber-50"
                                : "border-slate-200 bg-white hover:-translate-y-px hover:shadow-sm"
                          } ${dragId === t.id ? "opacity-40" : ""}`}
                        >
                          <span className="font-semibold leading-snug text-slate-800">{t.title}</span>
                          <span className="mt-0.5 block text-slate-500">
                            {t.estimateH} h
                            {late.length > 0 && <span className="font-medium text-amber-700"> · ⚠ waits on a later task</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </Row>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Drag a task to another person or week, or click it to edit. The coloured edge shows which mark it earns.
      </p>

      {selected && (
        <TaskEditor
          task={selected}
          members={members}
          weeks={weeks}
          weekLabel={weekLabel}
          criteria={selected.criterionIds.map((id) => {
            const i = criteria.findIndex((c) => c.id === id);
            return { name: criteria[i]?.name ?? id, dot: criterionColor(i).dot };
          })}
          dependsOn={selected.dependsOn.map((id) => byId.get(id)?.title ?? id)}
          onMove={(owner, week) => move(selected, owner, week)}
          onEstimate={(estimateH) => onChange({ ...selected, estimateH })}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// Grid rows are flat cells; this keeps the JSX grouped by person.
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function TaskEditor({
  task,
  members,
  weeks,
  weekLabel,
  criteria,
  dependsOn,
  onMove,
  onEstimate,
  onClose,
}: {
  task: Task;
  members: string[];
  weeks: string[];
  weekLabel: (w: string) => string;
  criteria: { name: string; dot: string }[];
  dependsOn: string[];
  onMove: (owner: string | null, week: string) => void;
  onEstimate: (estimateH: number) => void;
  onClose: () => void;
}) {
  const week = task.due ? mondayOf(task.due) : weeks[0];

  return (
    <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Editing task</p>
          <p className="mt-1 text-base font-semibold text-slate-900">{task.title}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {criteria.map((c) => (
              <span
                key={c.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-700"
              >
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                {c.name}
              </span>
            ))}
          </div>
          <p className="mt-2 border-l-2 border-slate-300 pl-3 text-xs italic text-slate-500">“{task.sourceLine}”</p>
          {dependsOn.length > 0 && <p className="mt-1.5 text-xs text-slate-500">Comes after: {dependsOn.join(", ")}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-lg leading-none text-slate-400 hover:bg-white hover:text-slate-700"
          aria-label="Close editor"
        >
          ×
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="label">
          Who
          <select
            className="input mt-1 w-40 py-1.5"
            value={task.owner ?? ""}
            onChange={(e) => onMove(e.target.value || null, week)}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="label">
          Week
          <select className="input mt-1 w-60 py-1.5" value={week} onChange={(e) => onMove(task.owner, e.target.value)}>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekLabel(w)}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          Hours
          <input
            type="number"
            min={0}
            step={0.5}
            className="input mt-1 w-24 py-1.5"
            value={task.estimateH}
            onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && onEstimate(e.target.valueAsNumber)}
          />
        </label>
        <p className="self-end pb-2 text-xs text-slate-500">
          Estimate confidence: <span className="font-medium text-slate-700">{task.confidence}</span>
        </p>
      </div>
    </div>
  );
}
