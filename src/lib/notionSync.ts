// Role 4: Notion workspace. Token in NOTION_TOKEN, parent page in NOTION_PARENT_PAGE_ID.
// Write rows one at a time with a short delay (about 3 requests a second).
import type { Change, Project, Status } from "./schemas";

export async function createWorkspace(_p: Project): Promise<string> {
  // TODO(Role 4): task database, board/timeline view, team agreement page, weekly check-in page. Returns notionUrl.
  throw new Error("notionSync.createWorkspace not implemented");
}

export async function applyChanges(_p: Project, _changes: Change[]): Promise<void> {
  // TODO(Role 4): update owner/start/due on the matching rows.
}

export async function updateTaskStatus(_p: Project, _taskId: string, _status: Status): Promise<void> {
  // TODO(Role 4): update the Status property on the row.
}
