"use client";

// Role 3: input page
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CreateProjectRequest, Member } from "@contract";
import { AppHeader } from "@/components/AppHeader";
import { MemberCard } from "@/components/MemberCard";
import { createProject, USE_MOCK } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { DEMO_INPUT, DEMO_PROJECT_ID } from "@/lib/demoInput";

const emptyMember = (): Member => ({ name: "", hoursPerWeek: 5, skills: [], blocked: [] });

const PROMISES = [
  "Every task linked to a rubric mark",
  "Work shared by each person's real availability",
  "A draft you edit before anything is saved",
];

function validate(req: CreateProjectRequest): string[] {
  const errors: string[] = [];
  if (!req.brief) errors.push("Paste the assignment brief.");
  if (!req.rubric) errors.push("Paste the marking rubric.");
  if (!req.deadline) errors.push("Pick a deadline.");
  else if (req.deadline <= todayISO()) errors.push("The deadline must be in the future.");
  if (req.members.length === 0) errors.push("Add at least one team member.");

  const names = req.members.map((m) => m.name.toLowerCase());
  req.members.forEach((m, i) => {
    const label = m.name || `Member ${i + 1}`;
    if (!m.name) errors.push(`Member ${i + 1} needs a name.`);
    if (!(m.hoursPerWeek > 0)) errors.push(`${label} needs hours per week above 0.`);
    if (m.skills.length === 0) errors.push(`${label} needs at least one skill.`);
  });
  if (new Set(names.filter(Boolean)).size !== names.filter(Boolean).length) {
    errors.push("Each member needs a different name.");
  }
  return errors;
}

export default function InputPage() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [rubric, setRubric] = useState("");
  const [deadline, setDeadline] = useState("");
  const [members, setMembers] = useState<Member[]>([emptyMember()]);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const req: CreateProjectRequest = {
    brief: brief.trim(),
    rubric: rubric.trim(),
    deadline,
    members: members.map((m) => ({ ...m, name: m.name.trim() })),
  };
  // Colours follow alphabetical order so each person keeps theirs on later screens.
  const sortedNames = req.members.map((m) => m.name).filter(Boolean).sort();

  const fillDemo = () => {
    setBrief(DEMO_INPUT.brief);
    setRubric(DEMO_INPUT.rubric);
    setDeadline(DEMO_INPUT.deadline);
    setMembers(DEMO_INPUT.members.map((m) => ({ ...m, skills: [...m.skills], blocked: [...m.blocked] })));
    setErrors([]);
  };

  const updateMember = (i: number, member: Member) =>
    setMembers((ms) => ms.map((m, j) => (j === i ? member : m)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(req);
    setErrors(found);
    if (found.length > 0) return;

    setSubmitting(true);
    try {
      const plan = await createProject(req);
      router.push(`/projects/${plan.projectId}`);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : "Something went wrong. Try again."]);
      setSubmitting(false);
    }
  };

  return (
    <>
      <AppHeader step={1} />
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-10">
        <section className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-indigo-600">For student group projects</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Turn your assignment brief into a fair team plan.
            </h1>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-600">
              {PROMISES.map((p) => (
                <li key={p} className="flex items-center gap-1.5">
                  <span className="text-emerald-600">✓</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button type="button" onClick={fillDemo} className="btn-secondary">
              Fill with demo data
            </button>
            {!USE_MOCK && (
              <Link href={`/projects/${DEMO_PROJECT_ID}`} className="text-xs font-medium text-indigo-600 hover:underline">
                or open the ready-made MK301 demo →
              </Link>
            )}
          </div>
        </section>

        <form onSubmit={submit} className="mt-10 space-y-6" noValidate>
          <section className="card p-6">
            <SectionHeading n={1} title="The assignment" hint="Paste the text straight from your module page." />
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div>
                <label htmlFor="brief" className="text-sm font-medium text-slate-700">
                  Assignment brief
                </label>
                <textarea
                  id="brief"
                  rows={10}
                  className="input mt-1.5 resize-y leading-relaxed"
                  placeholder="Paste the full brief from your lecturer…"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="rubric" className="text-sm font-medium text-slate-700">
                  Marking rubric
                </label>
                <textarea
                  id="rubric"
                  rows={10}
                  className="input mt-1.5 resize-y leading-relaxed"
                  placeholder="Paste the marking criteria and their weights…"
                  value={rubric}
                  onChange={(e) => setRubric(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="deadline" className="text-sm font-medium text-slate-700">
                  Deadline
                </label>
                <input
                  id="deadline"
                  type="date"
                  className="input mt-1.5 w-48"
                  min={todayISO()}
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
              <p className="pb-2 text-xs text-slate-500">We plan backwards from this date, with a 2-day buffer.</p>
            </div>
          </section>

          <section className="card p-6">
            <div className="flex items-start justify-between gap-4">
              <SectionHeading n={2} title="The team" hint="Hours and days off decide how work is shared." />
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {members.length} {members.length === 1 ? "member" : "members"}
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {members.map((member, i) => (
                <MemberCard
                  key={i}
                  member={member}
                  index={i}
                  colorIndex={sortedNames.indexOf(member.name.trim())}
                  deadline={deadline}
                  canRemove={members.length > 1}
                  onChange={(m) => updateMember(i, m)}
                  onRemove={() => setMembers((ms) => ms.filter((_, j) => j !== i))}
                />
              ))}
              <button
                type="button"
                onClick={() => setMembers((ms) => [...ms, emptyMember()])}
                className="w-full rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-medium text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
              >
                + Add member
              </button>
            </div>
          </section>

          {errors.length > 0 && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
              <p className="font-semibold">Fix these before making the plan:</p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <p className="text-sm text-slate-500">Estimates are guesses. You can edit everything on the next screen.</p>
            <button type="submit" disabled={submitting} className="btn-primary px-6">
              {submitting ? (
                <>
                  <Spinner /> Making plan…
                </>
              ) : (
                <>Make draft plan →</>
              )}
            </button>
          </div>
        </form>

        {USE_MOCK && (
          <details className="mt-10 text-sm">
            <summary className="cursor-pointer text-slate-400 hover:text-slate-600">
              Developer: data this form sends (POST /api/projects)
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
              {JSON.stringify(req, null, 2)}
            </pre>
          </details>
        )}
      </main>
    </>
  );
}

function SectionHeading({ n, title, hint }: { n: number; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">
        {n}
      </span>
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />;
}
