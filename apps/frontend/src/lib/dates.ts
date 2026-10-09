// Role 3: date helpers. Dates are "YYYY-MM-DD" strings everywhere (see CONTRACT.md).

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "2026-10-20" -> "Tue 20 Oct"
export const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", month: "short" });

// "2026-10-20" -> "20 Oct"
export const formatShort = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IE", { day: "numeric", month: "short" });

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// The Monday of the week `iso` falls in.
export const mondayOf = (iso: string) => addDays(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

// Whole days from `from` to `to` (negative when `to` is earlier).
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
