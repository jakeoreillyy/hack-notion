import type { Load } from "@contract";

// Planned hours against available hours per person. Alphabetical, never ranked.
export function LoadBars({ load }: { load: Load[] }) {
  const sorted = [...load].sort((a, b) => a.member.localeCompare(b.member));

  return (
    <ul className="space-y-3">
      {sorted.map((l) => {
        const over = l.plannedH > l.availableH;
        const pct = l.availableH > 0 ? Math.min(100, (l.plannedH / l.availableH) * 100) : 100;
        return (
          <li key={l.member}>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{l.member}</span>
              <span className={over ? "font-medium text-red-700" : "text-slate-500"}>
                {l.plannedH} / {l.availableH} h{over && " · over available time"}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-slate-200">
              <div
                className={`h-2 rounded-full ${over ? "bg-red-500" : "bg-indigo-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
