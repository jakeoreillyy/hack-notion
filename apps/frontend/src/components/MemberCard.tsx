"use client";

import { useState } from "react";
import type { Member, Skill } from "@contract";
import { formatDay } from "@/lib/dates";

// Same list as Skill in the contract; a typo here is a type error.
const SKILLS: Skill[] = ["research", "writing", "data", "design", "presenting", "coding", "editing"];

type Props = {
  member: Member;
  index: number;
  deadline: string;
  canRemove: boolean;
  onChange: (member: Member) => void;
  onRemove: () => void;
};

export function MemberCard({ member, index, deadline, canRemove, onChange, onRemove }: Props) {
  const [blockedDraft, setBlockedDraft] = useState("");

  const toggleSkill = (skill: Skill) => {
    const skills = member.skills.includes(skill)
      ? member.skills.filter((s) => s !== skill)
      : [...member.skills, skill];
    onChange({ ...member, skills });
  };

  const addBlocked = () => {
    if (!blockedDraft || member.blocked.includes(blockedDraft)) return;
    onChange({ ...member, blocked: [...member.blocked, blockedDraft].sort() });
    setBlockedDraft("");
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-500" htmlFor={`name-${index}`}>
            Name
          </label>
          <input
            id={`name-${index}`}
            className="input mt-1"
            placeholder={`Member ${index + 1}`}
            value={member.name}
            onChange={(e) => onChange({ ...member, name: e.target.value })}
          />
        </div>
        <div className="w-32">
          <label className="text-xs font-medium text-slate-500" htmlFor={`hours-${index}`}>
            Hours per week
          </label>
          <input
            id={`hours-${index}`}
            type="number"
            min={1}
            max={40}
            className="input mt-1"
            value={Number.isNaN(member.hoursPerWeek) ? "" : member.hoursPerWeek}
            onChange={(e) => onChange({ ...member, hoursPerWeek: e.target.valueAsNumber })}
          />
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mt-6 rounded-md px-2 py-1.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Remove ${member.name || `member ${index + 1}`}`}
          >
            Remove
          </button>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="text-xs font-medium text-slate-500">Skills</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {SKILLS.map((skill) => {
            const on = member.skills.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSkill(skill)}
                className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors ${
                  on
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                }`}
              >
                {skill}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4">
        <label className="text-xs font-medium text-slate-500" htmlFor={`blocked-${index}`}>
          Days they can&apos;t work
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            id={`blocked-${index}`}
            type="date"
            className="input w-44"
            max={deadline || undefined}
            value={blockedDraft}
            onChange={(e) => setBlockedDraft(e.target.value)}
          />
          <button
            type="button"
            onClick={addBlocked}
            disabled={!blockedDraft}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Add day
          </button>
          {member.blocked.map((day) => (
            <span
              key={day}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-700"
            >
              {formatDay(day)}
              <button
                type="button"
                onClick={() => onChange({ ...member, blocked: member.blocked.filter((d) => d !== day) })}
                className="rounded-full px-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                aria-label={`Remove ${formatDay(day)}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
