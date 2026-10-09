import type { Load } from "@contract";
import { Avatar } from "@/components/Avatar";

// Planned hours against available hours per person. Alphabetical, never ranked.
export function LoadBars({ load }: { load: Load[] }) {
  const sorted = [...load].sort((a, b) => a.member.localeCompare(b.member));

  return (
    <ul className="space-y-3.5">
      {sorted.map((l, i) => {
        const over = l.plannedH > l.availableH;
        const pct = l.availableH > 0 ? Math.min(100, (l.plannedH / l.availableH) * 100) : 100;
        return (
          <li key={l.member} className="flex items-center gap-3">
            <Avatar name={l.member} colorIndex={i} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2 text-sm">
                <span className="font-medium text-slate-800">{l.member}</span>
                <span className={over ? "font-semibold text-margin" : "text-slate-500"}>
                  {+l.plannedH.toFixed(1)} / {l.availableH} h
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-[1px] bg-slate-100">
                <div
                  className={`h-full transition-all duration-500 ${over ? "bg-margin" : "bg-indigo-600"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {over && <p className="mt-1 text-xs text-margin">More work than available time</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
