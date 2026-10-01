import { API_BASE_URL } from "../config";

async function request(path: string, options: RequestInit = {}, token?: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  let data: any = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON response */
  }
  if (!r.ok) {
    const msg = (data && data.detail) || `Request failed (${r.status})`;
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return data;
}

// ---------------- workspaces ----------------
export interface Workspace {
  id: number;
  name: string;
  owner_user_id: number;
  created_at: string;
  role: "owner" | "member";
}

export async function createWorkspaceApi(token: string, name: string): Promise<Workspace> {
  const data = await request("/workspaces", { method: "POST", body: JSON.stringify({ name }) }, token);
  return data.workspace;
}

export async function listWorkspacesApi(token: string): Promise<Workspace[]> {
  const data = await request("/workspaces", { method: "GET" }, token);
  return data.workspaces;
}

export async function inviteWorkspaceApi(
  token: string,
  workspaceId: number
): Promise<{ code: string; expires_days: number }> {
  return request(
    "/workspaces/invite",
    { method: "POST", body: JSON.stringify({ workspace_id: workspaceId }) },
    token
  );
}

/** Same code shape as list sharing — 6 characters, no ambiguous letters — so
 * this deliberately upper-cases before sending rather than trusting input. */
export async function joinWorkspaceApi(token: string, code: string): Promise<Workspace> {
  const data = await request(
    "/workspaces/join",
    { method: "POST", body: JSON.stringify({ code: code.trim().toUpperCase() }) },
    token
  );
  return data.workspace;
}

// ---------------- Diwan register ----------------
export type DiwanDirection = "incoming" | "outgoing";

export interface DiwanEntry {
  id: number;
  workspace_id: number;
  direction: DiwanDirection;
  serial_number: number;
  entity_name: string;
  subject: string | null;
  department: string | null;
  entry_date: string;
  reply_to_id: number | null;
  replied: boolean;
  attachment_url: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface DiwanCreatePayload {
  direction: DiwanDirection;
  entity_name: string;
  subject?: string;
  department?: string;
  entry_date?: string;
  reply_to_id?: number;
  attachment_url?: string;
}

export async function listDiwanApi(
  token: string,
  workspaceId: number,
  direction?: DiwanDirection,
  department?: string
): Promise<DiwanEntry[]> {
  const params = new URLSearchParams();
  if (direction) params.set("direction", direction);
  if (department) params.set("department", department);
  const qs = params.toString();
  const data = await request(
    `/workspaces/${workspaceId}/diwan${qs ? `?${qs}` : ""}`,
    { method: "GET" },
    token
  );
  return data.entries;
}

export async function createDiwanApi(
  token: string,
  workspaceId: number,
  payload: DiwanCreatePayload
): Promise<DiwanEntry> {
  const data = await request(
    `/workspaces/${workspaceId}/diwan`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
  return data.entry;
}

export async function getDiwanApi(
  token: string,
  workspaceId: number,
  entryId: number
): Promise<DiwanEntry> {
  const data = await request(`/workspaces/${workspaceId}/diwan/${entryId}`, { method: "GET" }, token);
  return data.entry;
}

export async function setDiwanRepliedApi(
  token: string,
  workspaceId: number,
  entryId: number,
  replied: boolean
): Promise<DiwanEntry> {
  const data = await request(
    `/workspaces/${workspaceId}/diwan/${entryId}`,
    { method: "PATCH", body: JSON.stringify({ replied }) },
    token
  );
  return data.entry;
}

export interface DiwanUpdatePayload {
  entity_name?: string;
  subject?: string;
  department?: string;
  attachment_url?: string;
}

export async function updateDiwanApi(
  token: string,
  workspaceId: number,
  entryId: number,
  payload: DiwanUpdatePayload
): Promise<DiwanEntry> {
  const data = await request(
    `/workspaces/${workspaceId}/diwan/${entryId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  );
  return data.entry;
}

// ---------------- debt ledger (Daftar Al-Dayn) ----------------
export type DebtDirection = "they_owe_us" | "we_owe_them";
export type DebtCurrency = "USD" | "IQD";

export interface DebtEntry {
  id: number;
  workspace_id: number;
  party_name: string;
  party_phone: string | null;
  direction: DebtDirection;
  amount: number;
  currency: DebtCurrency;
  note: string | null;
  settled: boolean;
  due_date: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  settled_at: string | null;
}

export interface DebtCreatePayload {
  party_name: string;
  direction: DebtDirection;
  amount: number;
  currency: DebtCurrency;
  party_phone?: string;
  note?: string;
  due_date?: string;
}

export async function listDebtApi(
  token: string,
  workspaceId: number,
  direction?: DebtDirection,
  settled?: boolean
): Promise<DebtEntry[]> {
  const params = new URLSearchParams();
  if (direction) params.set("direction", direction);
  if (settled !== undefined) params.set("settled", String(settled));
  const qs = params.toString();
  const data = await request(`/workspaces/${workspaceId}/debt${qs ? `?${qs}` : ""}`, { method: "GET" }, token);
  return data.entries;
}

export async function createDebtApi(
  token: string,
  workspaceId: number,
  payload: DebtCreatePayload
): Promise<DebtEntry> {
  const data = await request(
    `/workspaces/${workspaceId}/debt`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
  return data.entry;
}

export async function getDebtApi(token: string, workspaceId: number, entryId: number): Promise<DebtEntry> {
  const data = await request(`/workspaces/${workspaceId}/debt/${entryId}`, { method: "GET" }, token);
  return data.entry;
}

export interface DebtUpdatePayload {
  party_name?: string;
  party_phone?: string;
  amount?: number;
  currency?: DebtCurrency;
  note?: string;
  due_date?: string;
}

export async function updateDebtApi(
  token: string,
  workspaceId: number,
  entryId: number,
  payload: DebtUpdatePayload
): Promise<DebtEntry> {
  const data = await request(
    `/workspaces/${workspaceId}/debt/${entryId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  );
  return data.entry;
}

export async function setDebtSettledApi(
  token: string,
  workspaceId: number,
  entryId: number,
  settled: boolean
): Promise<DebtEntry> {
  const data = await request(
    `/workspaces/${workspaceId}/debt/${entryId}`,
    { method: "PATCH", body: JSON.stringify({ settled }) },
    token
  );
  return data.entry;
}

// ---------------- workspace members ----------------
export interface WorkspaceMember {
  user_id: number;
  username: string;
  role: "owner" | "member";
}

export async function listMembersApi(token: string, workspaceId: number): Promise<WorkspaceMember[]> {
  const data = await request(`/workspaces/${workspaceId}/members`, { method: "GET" }, token);
  return data.members;
}

// ---------------- shared tasks ----------------
export type TaskStatus = "todo" | "in_progress" | "review" | "done";

export interface WorkTask {
  id: number;
  workspace_id: number;
  title: string;
  assignee_user_id: number | null;
  due_date: string | null;
  done: boolean;
  status: TaskStatus;
  attachment_url: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface WorkTaskCreatePayload {
  title: string;
  assignee_user_id?: number;
  due_date?: string;
  status?: TaskStatus;
  attachment_url?: string;
}

export async function listTasksApi(
  token: string,
  workspaceId: number,
  assigneeUserId?: number,
  done?: boolean
): Promise<WorkTask[]> {
  const params = new URLSearchParams();
  if (assigneeUserId !== undefined) params.set("assignee_user_id", String(assigneeUserId));
  if (done !== undefined) params.set("done", String(done));
  const qs = params.toString();
  const data = await request(`/workspaces/${workspaceId}/tasks${qs ? `?${qs}` : ""}`, { method: "GET" }, token);
  return data.tasks;
}

export async function createTaskApi(
  token: string,
  workspaceId: number,
  payload: WorkTaskCreatePayload
): Promise<WorkTask> {
  const data = await request(
    `/workspaces/${workspaceId}/tasks`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
  return data.task;
}

export async function getTaskApi(token: string, workspaceId: number, taskId: number): Promise<WorkTask> {
  const data = await request(`/workspaces/${workspaceId}/tasks/${taskId}`, { method: "GET" }, token);
  return data.task;
}

/** assignee_user_id is optional-and-nullable on purpose: the key being
 * absent from the payload means "leave the assignee alone", present with a
 * number means reassign, present as null means clear back to unassigned.
 * The backend tells those apart via Pydantic's model_fields_set, so building
 * this payload with the key genuinely omitted (not just undefined) matters —
 * see updateTaskApi's callers. */
export interface WorkTaskUpdatePayload {
  title?: string;
  assignee_user_id?: number | null;
  due_date?: string;
  done?: boolean;
  status?: TaskStatus;
  attachment_url?: string;
}

export async function updateTaskApi(
  token: string,
  workspaceId: number,
  taskId: number,
  payload: WorkTaskUpdatePayload
): Promise<WorkTask> {
  const data = await request(
    `/workspaces/${workspaceId}/tasks/${taskId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  );
  return data.task;
}

export async function setTaskDoneApi(
  token: string,
  workspaceId: number,
  taskId: number,
  done: boolean
): Promise<WorkTask> {
  const data = await request(
    `/workspaces/${workspaceId}/tasks/${taskId}`,
    { method: "PATCH", body: JSON.stringify({ done }) },
    token
  );
  return data.task;
}

export interface TaskComment {
  id: number;
  workspace_id: number;
  task_id: number;
  author_user_id: number;
  author_username: string;
  body: string;
  created_at: string;
}

export async function listTaskCommentsApi(
  token: string,
  workspaceId: number,
  taskId: number
): Promise<TaskComment[]> {
  const data = await request(`/workspaces/${workspaceId}/tasks/${taskId}/comments`, { method: "GET" }, token);
  return data.comments;
}

export async function addTaskCommentApi(
  token: string,
  workspaceId: number,
  taskId: number,
  body: string
): Promise<TaskComment> {
  const data = await request(
    `/workspaces/${workspaceId}/tasks/${taskId}/comments`,
    { method: "POST", body: JSON.stringify({ body }) },
    token
  );
  return data.comment;
}

// ---------------- task checklist (subtasks) ----------------
// Flat: a title and a done flag, ordered by creation. Not nested sub-tasks
// with their own assignee/due-date/status -- see workspace.py's table
// comment for why that's a deliberately bigger feature this isn't.
export interface ChecklistItem {
  id: number;
  workspace_id: number;
  task_id: number;
  title: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}

export async function listChecklistApi(
  token: string,
  workspaceId: number,
  taskId: number
): Promise<ChecklistItem[]> {
  const data = await request(`/workspaces/${workspaceId}/tasks/${taskId}/checklist`, { method: "GET" }, token);
  return data.items;
}

export async function addChecklistItemApi(
  token: string,
  workspaceId: number,
  taskId: number,
  title: string
): Promise<ChecklistItem> {
  const data = await request(
    `/workspaces/${workspaceId}/tasks/${taskId}/checklist`,
    { method: "POST", body: JSON.stringify({ title }) },
    token
  );
  return data.item;
}

export async function updateChecklistItemApi(
  token: string,
  workspaceId: number,
  taskId: number,
  itemId: number,
  payload: { title?: string; done?: boolean }
): Promise<ChecklistItem> {
  const data = await request(
    `/workspaces/${workspaceId}/tasks/${taskId}/checklist/${itemId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  );
  return data.item;
}

export async function deleteChecklistItemApi(
  token: string,
  workspaceId: number,
  taskId: number,
  itemId: number
): Promise<void> {
  await request(`/workspaces/${workspaceId}/tasks/${taskId}/checklist/${itemId}`, { method: "DELETE" }, token);
}

// ---------------- approval requests ----------------
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface ApprovalRequest {
  id: number;
  workspace_id: number;
  title: string;
  description: string | null;
  amount: number | null;
  currency: DebtCurrency | null;
  requested_by: number;
  approver_user_id: number;
  status: ApprovalStatus;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

export interface ApprovalCreatePayload {
  title: string;
  approver_user_id: number;
  description?: string;
  amount?: number;
  currency?: DebtCurrency;
}

export async function listApprovalsApi(
  token: string,
  workspaceId: number,
  status?: ApprovalStatus,
  approverUserId?: number
): Promise<ApprovalRequest[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (approverUserId !== undefined) params.set("approver_user_id", String(approverUserId));
  const qs = params.toString();
  const data = await request(`/workspaces/${workspaceId}/approvals${qs ? `?${qs}` : ""}`, { method: "GET" }, token);
  return data.requests;
}

export async function createApprovalApi(
  token: string,
  workspaceId: number,
  payload: ApprovalCreatePayload
): Promise<ApprovalRequest> {
  const data = await request(
    `/workspaces/${workspaceId}/approvals`,
    { method: "POST", body: JSON.stringify(payload) },
    token
  );
  return data.request;
}

export async function getApprovalApi(
  token: string,
  workspaceId: number,
  requestId: number
): Promise<ApprovalRequest> {
  const data = await request(`/workspaces/${workspaceId}/approvals/${requestId}`, { method: "GET" }, token);
  return data.request;
}

export async function decideApprovalApi(
  token: string,
  workspaceId: number,
  requestId: number,
  approve: boolean,
  note?: string
): Promise<ApprovalRequest> {
  const data = await request(
    `/workspaces/${workspaceId}/approvals/${requestId}`,
    { method: "PATCH", body: JSON.stringify({ approve, note }) },
    token
  );
  return data.request;
}

/** Withdrawing your own still-pending request — distinct from decideApprovalApi,
 * which only the assigned approver may call. */
export async function cancelApprovalApi(
  token: string,
  workspaceId: number,
  requestId: number
): Promise<ApprovalRequest> {
  const data = await request(
    `/workspaces/${workspaceId}/approvals/${requestId}`,
    { method: "PATCH", body: JSON.stringify({ cancel: true }) },
    token
  );
  return data.request;
}

// ---------------- activity log ----------------
// detail is intentionally an untyped bag rather than a per-kind interface —
// it's a small json blob whose shape depends on `kind` (see workspace.py's
// log_activity call sites), and the frontend template picking already
// switches on `kind` before touching detail's fields.
export type ActivityKind =
  | "diwan_created"
  | "diwan_replied"
  | "debt_created"
  | "debt_settled"
  | "task_created"
  | "task_completed"
  | "task_commented"
  | "approval_created"
  | "approval_decided"
  | "approval_cancelled";

export interface ActivityEntry {
  id: number;
  workspace_id: number;
  actor_user_id: number;
  kind: ActivityKind;
  detail: Record<string, any>;
  created_at: string;
}

export async function listActivityApi(
  token: string,
  workspaceId: number,
  limit?: number
): Promise<ActivityEntry[]> {
  const qs = limit !== undefined ? `?limit=${limit}` : "";
  const data = await request(`/workspaces/${workspaceId}/activity${qs}`, { method: "GET" }, token);
  return data.activity;
}

// ---------------- notifications ----------------
// In-app only -- no push/email pipeline exists yet (see workspace.py's
// module notes on this table). Always scoped server-side to the calling
// user, so there's no user_id parameter to pass here.
export type NotificationKind = "task_assigned" | "task_commented" | "approval_requested" | "approval_decided";

export interface AppNotification {
  id: number;
  workspace_id: number;
  user_id: number;
  kind: NotificationKind;
  detail: Record<string, any>;
  read: boolean;
  created_at: string;
}

export async function listNotificationsApi(
  token: string,
  workspaceId: number,
  unreadOnly?: boolean,
  limit?: number
): Promise<{ notifications: AppNotification[]; unread_count: number }> {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("unread_only", "true");
  if (limit !== undefined) params.set("limit", String(limit));
  const qs = params.toString();
  return request(`/workspaces/${workspaceId}/notifications${qs ? `?${qs}` : ""}`, { method: "GET" }, token);
}

export async function markNotificationReadApi(
  token: string,
  workspaceId: number,
  notificationId: number
): Promise<void> {
  await request(`/workspaces/${workspaceId}/notifications/${notificationId}/read`, { method: "POST" }, token);
}

export async function markAllNotificationsReadApi(token: string, workspaceId: number): Promise<void> {
  await request(`/workspaces/${workspaceId}/notifications/read_all`, { method: "POST" }, token);
}

// ---------------- CSV export ----------------
// Plain text, not request() -- that helper always parses JSON, and a CSV
// response body isn't JSON.
async function fetchCsv(path: string, token: string): Promise<string> {
  const r = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Export failed (${r.status})`);
  return r.text();
}

export function fetchDiwanCsv(token: string, workspaceId: number): Promise<string> {
  return fetchCsv(`/workspaces/${workspaceId}/diwan/export`, token);
}

export function fetchDebtCsv(token: string, workspaceId: number): Promise<string> {
  return fetchCsv(`/workspaces/${workspaceId}/debt/export`, token);
}

export function fetchTasksCsv(token: string, workspaceId: number): Promise<string> {
  return fetchCsv(`/workspaces/${workspaceId}/tasks/export`, token);
}
