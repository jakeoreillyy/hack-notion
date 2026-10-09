"use client";

import { useState } from "react";
import type { Member, Skill } from "@contract";
import { Avatar } from "@/components/Avatar";
import { formatDay } from "@/lib/dates";

// Same list as Skill in the contract; a typo here is a type error.
const SKILLS: Skill[] = ["research", "writing", "data", "design", "presenting", "coding", "editing"];

type Props = {
  member: Member;
  index: number;
  colorIndex: number;
  deadline: string;
  canRemove: boolean;
  onChange: (member: Member) => void;
  onRemove: () => void;
};

export function MemberCard({ member, index, colorIndex, deadline, canRemove, onChange, onRemove }: Props) {
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
    <div className="rounded-[4px] border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-end gap-3">
        <Avatar name={member.name || `${index + 1}`} colorIndex={member.name ? colorIndex : -1} size="lg" />
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor={`name-${index}`}>
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
          <label className="label" htmlFor={`hours-${index}`}>
            Hours per week
          </label>
          <div className="relative mt-1">
            <input
              id={`hours-${index}`}
              type="number"
              min={1}
              max={40}
              className="input pr-8"
              value={Number.isNaN(member.hoursPerWeek) ? "" : member.hoursPerWeek}
              onChange={(e) => onChange({ ...member, hoursPerWeek: e.target.valueAsNumber })}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">h</span>
          </div>
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="mb-0.5 rounded-[4px] px-2.5 py-2 text-sm text-slate-400 underline-offset-2 transition hover:text-margin hover:underline"
            aria-label={`Remove ${member.name || `member ${index + 1}`}`}
          >
            Remove
          </button>
        )}
      </div>

      <fieldset className="mt-4">
        <legend className="label">Skills</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {SKILLS.map((skill) => {
            const on = member.skills.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSkill(skill)}
                className={`rounded-[3px] border px-2.5 py-1 text-xs font-medium capitalize transition ${
                  on
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-slate-500 hover:text-slate-900"
                }`}
              >
                {on && "✓ "}
                {skill}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4">
        <label className="label" htmlFor={`blocked-${index}`}>
          Days they can&apos;t work
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <input
            id={`blocked-${index}`}
            type="date"
            className="input w-44 py-1.5"
            max={deadline || undefined}
            value={blockedDraft}
            onChange={(e) => setBlockedDraft(e.target.value)}
          />
          <button type="button" onClick={addBlocked} disabled={!blockedDraft} className="btn-secondary py-1.5">
            Add day
          </button>
          {member.blocked.map((day) => (
            <span
              key={day}
              className="inline-flex items-center gap-1 rounded-[3px] border border-slate-300 bg-white py-1 pl-2.5 pr-1 text-xs font-medium text-slate-700"
            >
              {formatDay(day)}
              <button
                type="button"
                onClick={() => onChange({ ...member, blocked: member.blocked.filter((d) => d !== day) })}
                className="rounded-[2px] px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
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
