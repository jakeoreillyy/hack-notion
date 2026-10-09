// Role 1: a task notifies when status !== "done", it has an owner, and due is within 2 days of today or past.
import type { Notification, Task } from "../schemas";

const DAY = 86_400_000;
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export function findNotifications(tasks: Task[], today: string): Notification[] {
  const out: Notification[] = [];
  for (const t of tasks) {
    if (t.status === "done" || !t.owner || !t.due) continue;
    const daysLeft = Math.round((Date.parse(t.due) - Date.parse(today)) / DAY);
    if (Number.isNaN(daysLeft) || daysLeft > 2) continue; // NaN: an unparseable date, so no notification
    const when = daysLeft < 0 ? `overdue by ${days(-daysLeft)}` : daysLeft === 0 ? "due today" : `due in ${days(daysLeft)}`;
    out.push({
      taskId: t.id,
      owner: t.owner,
      daysLeft,
      message: `'${t.title}' is ${when}${t.status === "todo" ? " and hasn't been started" : ""}.`,
    });
  }
  return out;
}
