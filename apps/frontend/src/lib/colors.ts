// Role 3: fixed colour sets. Class names are written out in full so Tailwind picks them up.

// Per person, by their position in the alphabetical member list (same colour on every screen).
const PEOPLE = [
  "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800",
  "bg-emerald-100 text-emerald-800",
  "bg-amber-100 text-amber-900",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
  "bg-orange-100 text-orange-800",
  "bg-fuchsia-100 text-fuchsia-800",
];

export const personColor = (index: number) => (index < 0 ? "bg-slate-100 text-slate-500" : PEOPLE[index % PEOPLE.length]);

// Per rubric criterion, by its position in the criteria list.
const CRITERIA = [
  { dot: "bg-indigo-500", edge: "border-l-indigo-500" },
  { dot: "bg-emerald-500", edge: "border-l-emerald-500" },
  { dot: "bg-amber-500", edge: "border-l-amber-500" },
  { dot: "bg-rose-500", edge: "border-l-rose-500" },
  { dot: "bg-sky-500", edge: "border-l-sky-500" },
  { dot: "bg-violet-500", edge: "border-l-violet-500" },
  { dot: "bg-teal-500", edge: "border-l-teal-500" },
];

export const criterionColor = (index: number) =>
  index < 0 ? { dot: "bg-slate-400", edge: "border-l-slate-300" } : CRITERIA[index % CRITERIA.length];
