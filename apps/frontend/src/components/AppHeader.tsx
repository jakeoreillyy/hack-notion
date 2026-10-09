import Link from "next/link";
import { USE_MOCK } from "@/lib/api";

const STEPS = ["Set up", "Review plan", "Track progress"];

export function AppHeader({ step }: { step: 1 | 2 | 3 }) {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5 font-extrabold tracking-[-0.02em] text-slate-900">
          <Logo />
          <span className="hidden sm:inline">Buzz Plan</span>
        </Link>

        <ol className="flex items-center gap-1.5 text-xs sm:gap-3" aria-label="Progress">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "current" : "todo";
            return (
              <li key={label} className="flex items-center gap-1.5 sm:gap-3">
                {i > 0 && <span className={`h-px w-4 sm:w-8 ${n <= step ? "bg-indigo-600" : "bg-slate-300"}`} />}
                <span
                  aria-current={state === "current" ? "step" : undefined}
                  className={`flex items-center gap-1.5 ${state === "todo" ? "text-slate-400" : "text-slate-700"}`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-[3px] border-[1.5px] text-[10px] font-bold ${
                      state === "current"
                        ? "border-slate-900 bg-marker text-slate-900"
                        : state === "done"
                          ? "border-indigo-600 text-indigo-600"
                          : "border-slate-300 text-slate-400"
                    }`}
                  >
                    {state === "done" ? "✓" : n}
                  </span>
                  <span className={`hidden md:inline ${state === "current" ? "marker font-semibold text-slate-900" : ""}`}>{label}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {USE_MOCK ? (
          <span
            className="rounded-[3px] border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800"
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
    // A bee, drawn in biro with a highlighter body.
    <svg viewBox="0 0 30 28" className="h-7 w-[30px]" fill="none" aria-hidden>
      <defs>
        <clipPath id="bee-body">
          <ellipse cx="16.5" cy="17.5" rx="9" ry="6.5" />
        </clipPath>
      </defs>
      <ellipse cx="13" cy="8.5" rx="3.6" ry="5.4" transform="rotate(-25 13 8.5)" className="fill-indigo-50 stroke-slate-900" strokeWidth="1.75" />
      <ellipse cx="19.5" cy="9" rx="3.3" ry="5" transform="rotate(22 19.5 9)" className="fill-indigo-50 stroke-slate-900" strokeWidth="1.75" />
      <ellipse cx="16.5" cy="17.5" rx="9" ry="6.5" className="fill-marker" />
      <g clipPath="url(#bee-body)" className="fill-slate-900">
        <rect x="13" y="10" width="2.6" height="16" />
        <rect x="18.6" y="10" width="2.6" height="16" />
      </g>
      <ellipse cx="16.5" cy="17.5" rx="9" ry="6.5" className="stroke-slate-900" strokeWidth="2" />
      <path d="M25.2 16l3.3 1.5-3.3 1.5" className="fill-slate-900" />
      <circle cx="6.5" cy="16.5" r="3.7" className="fill-slate-900" />
      <path d="M5.5 13.2C4.8 10.8 3.6 9.6 2 9.4M8 13C8.3 10.6 9.4 9.2 11 8.6" className="stroke-slate-900" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
