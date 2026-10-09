import Link from "next/link";
import { USE_MOCK } from "@/lib/api";

const STEPS = ["Set up", "Review plan", "Track progress"];

export function AppHeader({ step }: { step: 1 | 2 | 3 }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight text-slate-900">
          <Logo />
          <span className="hidden sm:inline">Group Project Autopilot</span>
        </Link>

        <ol className="flex items-center gap-1.5 text-xs sm:gap-3" aria-label="Progress">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "current" : "todo";
            return (
              <li key={label} className="flex items-center gap-1.5 sm:gap-3">
                {i > 0 && <span className={`h-px w-4 sm:w-8 ${n <= step ? "bg-indigo-300" : "bg-slate-200"}`} />}
                <span
                  aria-current={state === "current" ? "step" : undefined}
                  className={`flex items-center gap-1.5 ${state === "todo" ? "text-slate-400" : "text-slate-700"}`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                      state === "current"
                        ? "bg-indigo-600 text-white"
                        : state === "done"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {state === "done" ? "✓" : n}
                  </span>
                  <span className={`hidden md:inline ${state === "current" ? "font-semibold" : ""}`}>{label}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {USE_MOCK ? (
          <span
            className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"
            title="Pages are using mock/response.json, not the backend"
          >
            Fake data
          </span>
        ) : (
          <span className="w-16" />
        )}
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm shadow-indigo-600/30">
      <svg viewBox="0 0 20 20" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
        <path d="M4 10.5l3.5 3.5L16 5.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
