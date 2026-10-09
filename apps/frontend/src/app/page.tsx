"use client";

// Role 3: input page
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CreateProjectRequest, Member } from "@contract";
import { MemberCard } from "@/components/MemberCard";
import { createProject, USE_MOCK } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import { DEMO_INPUT } from "@/lib/demoInput";

const emptyMember = (): Member => ({ name: "", hoursPerWeek: 5, skills: [], blocked: [] });

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
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Group Project Autopilot</h1>
            <p className="mt-1 text-slate-600">
              Paste your brief and add your team. You&apos;ll get a draft plan to review before anything is saved.
            </p>
          </div>
          <button
            type="button"
            onClick={fillDemo}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            Fill with demo data
          </button>
        </header>

        {USE_MOCK && (
          <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Using fake data: the plan you&apos;ll see comes from <code>mock/response.json</code>, not the backend.
          </p>
        )}

        <form onSubmit={submit} className="mt-6 space-y-8" noValidate>
          <section className="space-y-4">
            <h2 className="text-lg font-medium">1. The assignment</h2>
            <div>
              <label htmlFor="brief" className="text-sm font-medium text-slate-700">
                Assignment brief
              </label>
              <textarea
                id="brief"
                rows={8}
                className="input mt-1"
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
                rows={6}
                className="input mt-1"
                placeholder="Paste the marking criteria and their weights…"
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="deadline" className="text-sm font-medium text-slate-700">
                Deadline
              </label>
              <input
                id="deadline"
                type="date"
                className="input mt-1 w-48"
                min={todayISO()}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">2. The team</h2>
              <span className="text-sm text-slate-500">
                {members.length} {members.length === 1 ? "member" : "members"}
              </span>
            </div>
            {members.map((member, i) => (
              <MemberCard
                key={i}
                member={member}
                index={i}
                deadline={deadline}
                canRemove={members.length > 1}
                onChange={(m) => updateMember(i, m)}
                onRemove={() => setMembers((ms) => ms.filter((_, j) => j !== i))}
              />
            ))}
            <button
              type="button"
              onClick={() => setMembers((ms) => [...ms, emptyMember()])}
              className="w-full rounded-lg border border-dashed border-slate-300 py-3 text-sm text-slate-600 hover:border-slate-400 hover:bg-white"
            >
              + Add member
            </button>
          </section>

          {errors.length > 0 && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-medium">Fix these before making the plan:</p>
              <ul className="mt-1 list-disc pl-5">
                {errors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-end gap-4 border-t border-slate-200 pt-6">
            <p className="text-sm text-slate-500">Estimates are guesses. You can edit everything next.</p>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? "Making plan…" : "Make draft plan"}
            </button>
          </div>
        </form>

        {USE_MOCK && (
          <details className="mt-8 text-sm">
            <summary className="cursor-pointer text-slate-500">Data this form sends (POST /api/projects)</summary>
            <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-4 text-xs text-slate-100">
              {JSON.stringify(req, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </main>
  );
}
