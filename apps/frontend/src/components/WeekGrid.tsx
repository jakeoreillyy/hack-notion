"use client";

// Week-by-person view of the plan. A task sits in the week of its due date.
// Moving a task to a week sets start = that Monday and due = that Friday, so the contract's dates still hold.
import { useState } from "react";
import type { Criterion, Task } from "@contract";
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
  const weekLabel = (w: string) => `Week ${weeks.indexOf(w) + 1} · ${formatShort(w)}–${formatShort(addDays(w, 4))}`;

  const byId = new Map(tasks.map((t) => [t.id, t]));
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
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div
          className="grid min-w-max text-sm"
          style={{ gridTemplateColumns: `7rem repeat(${weeks.length}, minmax(11rem, 1fr))` }}
        >
          <div className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50" />
          {weeks.map((w) => (
            <div key={w} className="border-b border-l border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
              {weekLabel(w)}
            </div>
          ))}

          {rows.map((owner) => (
            <Row key={owner ?? "unassigned"}>
              <div className="sticky left-0 z-10 border-b border-slate-100 bg-white px-3 py-3 font-medium">
                {owner ?? <span className="text-slate-400">Unassigned</span>}
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
                    className={`min-h-20 space-y-1.5 border-b border-l border-slate-100 p-2 ${
                      dropCell === key ? "bg-indigo-50" : ""
                    }`}
                  >
                    {items.length > 0 && <p className="text-right text-xs text-slate-400">{hours} h</p>}
                    {items.map((t) => {
                      const late = lateDeps(t);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          draggable
                          onDragStart={() => setDragId(t.id)}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => setSelectedId(t.id === selectedId ? null : t.id)}
                          title={late.length ? `Starts before "${late[0].title}" is due` : `From the brief: "${t.sourceLine}"`}
                          className={`block w-full cursor-grab rounded-md border px-2 py-1.5 text-left text-xs shadow-sm active:cursor-grabbing ${
                            t.id === selectedId
                              ? "border-indigo-500 ring-1 ring-indigo-500"
                              : late.length
                                ? "border-amber-400 bg-amber-50"
                                : "border-slate-200 bg-white hover:border-slate-300"
                          }`}
                        >
                          <span className="font-medium text-slate-800">{t.title}</span>
                          <span className="block text-slate-500">
                            {t.estimateH} h{late.length > 0 && " · ⚠ waits on a later task"}
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
      <p className="mt-2 text-xs text-slate-500">Drag a task to another person or week, or click it to edit.</p>

      {selected && (
        <TaskEditor
          task={selected}
          members={members}
          weeks={weeks}
          weekLabel={weekLabel}
          criteria={selected.criterionIds.map((id) => criteria.find((c) => c.id === id)?.name ?? id)}
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
  criteria: string[];
  dependsOn: string[];
  onMove: (owner: string | null, week: string) => void;
  onEstimate: (estimateH: number) => void;
  onClose: () => void;
}) {
  const week = task.due ? mondayOf(task.due) : weeks[0];

  return (
    <div className="mt-4 rounded-lg border border-indigo-200 bg-white p-4 text-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{task.title}</p>
          <p className="mt-0.5 text-xs text-slate-600">Earns marks for: {criteria.join(", ")}</p>
          <p className="mt-0.5 text-xs italic text-slate-500">“{task.sourceLine}”</p>
          {dependsOn.length > 0 && <p className="mt-0.5 text-xs text-slate-400">After: {dependsOn.join(", ")}</p>}
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close editor">
          ×
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        <label className="text-xs font-medium text-slate-500">
          Who
          <select
            className="input mt-1 w-36 py-1"
            value={task.owner ?? ""}
            onChange={(e) => onMove(e.target.value || null, week)}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Week
          <select className="input mt-1 w-56 py-1" value={week} onChange={(e) => onMove(task.owner, e.target.value)}>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekLabel(w)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          Hours
          <input
            type="number"
            min={0}
            step={0.5}
            className="input mt-1 w-20 py-1"
            value={task.estimateH}
            onChange={(e) => !Number.isNaN(e.target.valueAsNumber) && onEstimate(e.target.valueAsNumber)}
          />
        </label>
      </div>
    </div>
  );
}
