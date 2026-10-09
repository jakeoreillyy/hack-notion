// Role 1: a task notifies when status !== "done", it has an owner, and due is within 2 days of today or past.
import type { Notification, Task } from "./schemas";

const DAY = 86_400_000;

export function findNotifications(tasks: Task[], today: string): Notification[] {
  const out: Notification[] = [];
  for (const t of tasks) {
    if (t.status === "done" || !t.owner || !t.due) continue;
    const daysLeft = Math.round((Date.parse(t.due) - Date.parse(today)) / DAY);
    if (daysLeft > 2) continue;
    const when = daysLeft < 0 ? `overdue by ${-daysLeft} day(s)` : `due in ${daysLeft} day(s)`;
    out.push({
      taskId: t.id,
      owner: t.owner,
      daysLeft,
      message: `"${t.title}" is ${when}${t.status === "todo" ? " and has not been started" : ""}.`,
    });
  }
  return out;
}
