// Role 2: working-day date helpers shared by the engine. Dates are YYYY-MM-DD, maths in UTC,
// and only weekdays count as working days.
import type { Member } from "../schemas";

const DAY_MS = 86_400_000;

const toMs = (d: string) => Date.parse(d + "T00:00:00Z");
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (d: string, n: number) => fromMs(toMs(d) + n * DAY_MS);

export function isWeekday(d: string): boolean {
  const day = new Date(toMs(d)).getUTCDay();
  return day !== 0 && day !== 6;
}

/** Moves by `n` working days (negative = backwards). With n = 0, returns `d` unchanged. */
export function addWorkingDays(d: string, n: number): string {
  const step = n < 0 ? -1 : 1;
  let cur = d;
  for (let left = Math.abs(n); left > 0; ) {
    cur = addDays(cur, step);
    if (isWeekday(cur)) left--;
  }
  return cur;
}

/** The working day before `d` (never `d` itself). */
export const prevWorkingDay = (d: string) => addWorkingDays(d, -1);

/** Weekdays in [from, to], inclusive. Empty when from > to. */
export function weekdaysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let cur = from; cur <= to; cur = addDays(cur, 1)) if (isWeekday(cur)) out.push(cur);
  return out;
}

/** Working days strictly after `from` up to and including `to`. */
export const workingDaysAfter = (from: string, to: string) => weekdaysBetween(addDays(from, 1), to).length;

export const dailyHours = (m: Member) => m.hoursPerWeek / 5;

/** A member's working days in [from, to]: weekdays minus their blocked days. */
export function freeDays(m: Member, from: string, to: string): string[] {
  const blocked = new Set(m.blocked);
  return weekdaysBetween(from, to).filter((d) => !blocked.has(d));
}

export const isBlockedBetween = (m: Member, from: string, to: string) =>
  m.blocked.some((d) => d >= from && d <= to && isWeekday(d));

/** Capacity formula from CONTRACT.md: hoursPerWeek x working weeks, minus hoursPerWeek/5 per blocked weekday. */
export function availableHours(m: Member, from: string, to: string): number {
  const weeks = weekdaysBetween(from, to).length / 5;
  const blockedWeekdays = new Set(m.blocked.filter((d) => d >= from && d <= to && isWeekday(d))).size;
  return round1(m.hoursPerWeek * weeks - dailyHours(m) * blockedWeekdays);
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Natural id order so t2 sorts before t10. Used for every tie-break, so output is repeatable. */
export const byId = (a: { id: string }, b: { id: string }) =>
  a.id.localeCompare(b.id, "en", { numeric: true });
