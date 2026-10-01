"""Workspace ("office mode") routes: diwan, debt ledger, shared tasks with
checklists and comments, approval requests, activity log and notifications.

Business logic and storage live in workspace.py; this module is the HTTP layer.
Mounted by main.py via app.include_router(router).
"""
import csv
import io
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

import auth
import workspace as ws

router = APIRouter()


# ---------------- workspaces (office mode) ----------------
# Not linked from the app's nav yet — API only, so the flow can be built and
# tested end to end before any of the app's three real users see it. Two
# roles only (owner/member) and free-text departments: guessing a fuller role
# taxonomy up front is how you build permissions nobody's workspace actually
# needs.
class WorkspaceBody(BaseModel):
    name: str = ""


class WorkspaceInviteBody(BaseModel):
    workspace_id: int


class WorkspaceJoinBody(BaseModel):
    code: str = ""


class DiwanCreateBody(BaseModel):
    direction: str = ""              # "incoming" | "outgoing"
    entity_name: str = ""
    subject: str | None = None
    department: str | None = None    # free text, not a fixed list
    entry_date: str | None = None    # ISO date; defaults to today
    reply_to_id: int | None = None
    attachment_url: str | None = None


class DiwanUpdateBody(BaseModel):
    entity_name: str | None = None
    subject: str | None = None
    department: str | None = None
    replied: bool | None = None
    attachment_url: str | None = None


class DebtCreateBody(BaseModel):
    party_name: str = ""
    party_phone: str | None = None
    direction: str = ""          # "they_owe_us" | "we_owe_them"
    amount: float = 0
    currency: str = ""           # "USD" | "IQD" — tracked as promised, not converted
    note: str | None = None
    due_date: str | None = None


class DebtUpdateBody(BaseModel):
    party_name: str | None = None
    party_phone: str | None = None
    amount: float | None = None
    currency: str | None = None
    note: str | None = None
    settled: bool | None = None
    due_date: str | None = None


class WorkTaskCreateBody(BaseModel):
    title: str = ""
    assignee_user_id: int | None = None
    due_date: str | None = None
    status: str | None = None        # "todo" | "in_progress" | "review" | "done"; defaults to "todo"
    attachment_url: str | None = None


class WorkTaskUpdateBody(BaseModel):
    title: str | None = None
    # None is a real value here ("unassign"), distinct from the field being
    # omitted ("leave the assignee alone") — the route checks
    # model_fields_set rather than trusting this default to mean "no change".
    assignee_user_id: int | None = None
    due_date: str | None = None
    done: bool | None = None
    status: str | None = None
    attachment_url: str | None = None


class TaskCommentBody(BaseModel):
    body: str = ""


class ChecklistItemCreateBody(BaseModel):
    title: str = ""


class ChecklistItemUpdateBody(BaseModel):
    title: str | None = None
    done: bool | None = None


class ApprovalCreateBody(BaseModel):
    title: str = ""
    approver_user_id: int = 0
    description: str | None = None
    amount: float | None = None
    currency: str | None = None


class ApprovalDecisionBody(BaseModel):
    approve: bool = True
    note: str | None = None
    cancel: bool = False


def _require_member(workspace_id: int, user):
    if ws.get_member_role(workspace_id, user["id"]) is None:
        raise HTTPException(status_code=403, detail="Not a member of this workspace.")


def _csv_response(rows: list[dict], fieldnames: list[str], filename: str) -> Response:
    """Exports the full record regardless of whatever filters the caller's
    list view happens to have active -- a CSV handed to an accountant should
    be the whole ledger, not whatever subset was on screen. Booleans render
    as True/False rather than 1/0 so the file reads naturally when opened
    directly in a spreadsheet, matching how list_*_entries already returns
    them."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/workspaces")
def create_workspace(body: WorkspaceBody, user=Depends(auth.current_user)):
    try:
        w = ws.create_workspace(user["id"], body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"workspace": {**w, "role": "owner"}}


@router.get("/workspaces")
def list_workspaces(user=Depends(auth.current_user)):
    return {"workspaces": ws.list_my_workspaces(user["id"])}


@router.post("/workspaces/invite")
def invite_to_workspace(body: WorkspaceInviteBody, user=Depends(auth.current_user)):
    """Same code mechanism as sharing a list — same generator, same expiry,
    same redemption shape — just carrying a workspace id instead of a list."""
    _require_member(body.workspace_id, user)
    payload = json.dumps({"workspace_id": body.workspace_id}, ensure_ascii=False)
    try:
        code = auth.create_share(user["id"], user["username"], "workspace", payload)
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"code": code, "expires_days": auth.SHARE_TTL_DAYS}


@router.post("/workspaces/join")
def join_workspace(body: WorkspaceJoinBody, user=Depends(auth.current_user)):
    share = auth.get_share(body.code)
    if share is None or share["kind"] != "workspace":
        raise HTTPException(status_code=404, detail="That code is not valid or has expired.")
    workspace_id = json.loads(share["payload"])["workspace_id"]
    w = ws.join_workspace(user["id"], workspace_id)
    if w is None:
        raise HTTPException(status_code=404, detail="That workspace no longer exists.")
    return {"workspace": {**w, "role": ws.get_member_role(workspace_id, user["id"])}}


@router.get("/workspaces/{workspace_id}/diwan")
def list_diwan(workspace_id: int, direction: str | None = None,
               department: str | None = None, q: str | None = None,
               user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    return {"entries": ws.list_diwan_entries(workspace_id, direction, department, q)}


# Registered before /diwan/{entry_id} on purpose — that route takes entry_id
# as an int, and Starlette matches routes in registration order, so "export"
# as a literal path segment has to be declared first or it would 422 trying
# to parse "export" as an entry id instead of ever reaching this handler.
@router.get("/workspaces/{workspace_id}/diwan/export")
def export_diwan(workspace_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    entries = ws.list_diwan_entries(workspace_id)
    fields = ["serial_number", "direction", "entity_name", "subject", "department",
              "entry_date", "replied", "reply_to_id", "attachment_url", "created_at"]
    return _csv_response(entries, fields, f"diwan_{workspace_id}.csv")


@router.post("/workspaces/{workspace_id}/diwan")
def create_diwan(workspace_id: int, body: DiwanCreateBody,
                 user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    try:
        entry = ws.create_diwan_entry(
            workspace_id, user["id"], body.direction, body.entity_name,
            subject=body.subject, department=body.department,
            entry_date=body.entry_date, reply_to_id=body.reply_to_id,
            attachment_url=body.attachment_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"entry": entry}


@router.get("/workspaces/{workspace_id}/diwan/{entry_id}")
def get_diwan(workspace_id: int, entry_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    entry = ws.get_diwan_entry(workspace_id, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    return {"entry": entry}


@router.patch("/workspaces/{workspace_id}/diwan/{entry_id}")
def update_diwan(workspace_id: int, entry_id: int, body: DiwanUpdateBody,
                 user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if ws.get_diwan_entry(workspace_id, entry_id) is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    try:
        ws.update_diwan_entry(workspace_id, entry_id, entity_name=body.entity_name,
                              subject=body.subject, department=body.department,
                              replied=body.replied, attachment_url=body.attachment_url,
                              actor_user_id=user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"entry": ws.get_diwan_entry(workspace_id, entry_id)}


# ---------------- debt ledger (Daftar Al-Dayn) ----------------
@router.get("/workspaces/{workspace_id}/debt")
def list_debt(workspace_id: int, direction: str | None = None,
              settled: bool | None = None, q: str | None = None,
              user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    return {"entries": ws.list_debt_entries(workspace_id, direction, settled, q)}


# Same registration-order note as export_diwan above.
@router.get("/workspaces/{workspace_id}/debt/export")
def export_debt(workspace_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    entries = ws.list_debt_entries(workspace_id)
    fields = ["party_name", "party_phone", "direction", "amount", "currency", "note",
              "settled", "due_date", "settled_at", "created_at"]
    return _csv_response(entries, fields, f"debt_{workspace_id}.csv")


@router.post("/workspaces/{workspace_id}/debt")
def create_debt(workspace_id: int, body: DebtCreateBody, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    try:
        entry = ws.create_debt_entry(
            workspace_id, user["id"], body.party_name, body.direction, body.amount,
            body.currency, party_phone=body.party_phone, note=body.note,
            due_date=body.due_date,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"entry": entry}


@router.get("/workspaces/{workspace_id}/debt/{entry_id}")
def get_debt(workspace_id: int, entry_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    entry = ws.get_debt_entry(workspace_id, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    return {"entry": entry}


@router.patch("/workspaces/{workspace_id}/debt/{entry_id}")
def update_debt(workspace_id: int, entry_id: int, body: DebtUpdateBody,
                user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if ws.get_debt_entry(workspace_id, entry_id) is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    try:
        ws.update_debt_entry(workspace_id, entry_id, party_name=body.party_name,
                             party_phone=body.party_phone, amount=body.amount,
                             currency=body.currency, note=body.note, settled=body.settled,
                             due_date=body.due_date, actor_user_id=user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"entry": ws.get_debt_entry(workspace_id, entry_id)}


@router.get("/workspaces/{workspace_id}/members")
def list_members(workspace_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    return {"members": ws.list_workspace_members(workspace_id)}


# ---------------- shared tasks ----------------
@router.get("/workspaces/{workspace_id}/tasks")
def list_tasks(workspace_id: int, assignee_user_id: int | None = None,
               done: bool | None = None, status: str | None = None, q: str | None = None,
               user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    return {"tasks": ws.list_workspace_tasks(workspace_id, assignee_user_id, done, status, q)}


@router.post("/workspaces/{workspace_id}/tasks")
def create_task(workspace_id: int, body: WorkTaskCreateBody, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    try:
        task = ws.create_workspace_task(
            workspace_id, user["id"], body.title,
            assignee_user_id=body.assignee_user_id, due_date=body.due_date,
            status=body.status, attachment_url=body.attachment_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"task": task}


# Same registration-order note as export_diwan: has to come before
# /tasks/{task_id} or "export" would 422 trying to parse as an int id.
@router.get("/workspaces/{workspace_id}/tasks/export")
def export_tasks(workspace_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    tasks = ws.list_workspace_tasks(workspace_id)
    # assignee_user_id alone isn't useful in a document a person reads --
    # resolved to a username the same way list_workspace_members already
    # joins against users, rather than exporting a bare id.
    usernames = {m["user_id"]: m["username"] for m in ws.list_workspace_members(workspace_id)}
    rows = [{**t, "assignee": usernames.get(t["assignee_user_id"], "")} for t in tasks]
    fields = ["title", "assignee", "status", "done", "due_date", "attachment_url", "created_at"]
    return _csv_response(rows, fields, f"tasks_{workspace_id}.csv")


@router.get("/workspaces/{workspace_id}/tasks/{task_id}")
def get_task(workspace_id: int, task_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    task = ws.get_workspace_task(workspace_id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"task": task}


@router.patch("/workspaces/{workspace_id}/tasks/{task_id}")
def update_task(workspace_id: int, task_id: int, body: WorkTaskUpdateBody,
                user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if ws.get_workspace_task(workspace_id, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    # assignee_user_id needs three states (unchanged / set / cleared), which a
    # bare Optional field can't express — None is a legitimate value ("clear
    # it") as well as the type's default, so "was it actually sent" has to
    # come from the request itself, not from the field's value.
    assignee_kwarg = {}
    if "assignee_user_id" in body.model_fields_set:
        assignee_kwarg["assignee_user_id"] = body.assignee_user_id
    try:
        ws.update_workspace_task(workspace_id, task_id, title=body.title,
                                 due_date=body.due_date, done=body.done, status=body.status,
                                 attachment_url=body.attachment_url,
                                 actor_user_id=user["id"], **assignee_kwarg)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"task": ws.get_workspace_task(workspace_id, task_id)}


@router.get("/workspaces/{workspace_id}/tasks/{task_id}/comments")
def list_task_comments(workspace_id: int, task_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if ws.get_workspace_task(workspace_id, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"comments": ws.list_task_comments(workspace_id, task_id)}


@router.post("/workspaces/{workspace_id}/tasks/{task_id}/comments")
def add_task_comment(workspace_id: int, task_id: int, body: TaskCommentBody,
                     user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if ws.get_workspace_task(workspace_id, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    try:
        comment = ws.add_task_comment(workspace_id, task_id, user["id"], body.body)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"comment": comment}


@router.get("/workspaces/{workspace_id}/tasks/{task_id}/checklist")
def list_checklist(workspace_id: int, task_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if ws.get_workspace_task(workspace_id, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"items": ws.list_checklist_items(workspace_id, task_id)}


@router.post("/workspaces/{workspace_id}/tasks/{task_id}/checklist")
def add_checklist_item(workspace_id: int, task_id: int, body: ChecklistItemCreateBody,
                       user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if ws.get_workspace_task(workspace_id, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    try:
        item = ws.add_checklist_item(workspace_id, task_id, body.title)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"item": item}


@router.patch("/workspaces/{workspace_id}/tasks/{task_id}/checklist/{item_id}")
def update_checklist_item(workspace_id: int, task_id: int, item_id: int,
                          body: ChecklistItemUpdateBody, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if ws.get_checklist_item(workspace_id, task_id, item_id) is None:
        raise HTTPException(status_code=404, detail="Checklist item not found.")
    try:
        ws.update_checklist_item(workspace_id, task_id, item_id, title=body.title, done=body.done)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"item": ws.get_checklist_item(workspace_id, task_id, item_id)}


@router.delete("/workspaces/{workspace_id}/tasks/{task_id}/checklist/{item_id}")
def delete_checklist_item(workspace_id: int, task_id: int, item_id: int,
                          user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if not ws.delete_checklist_item(workspace_id, task_id, item_id):
        raise HTTPException(status_code=404, detail="Checklist item not found.")
    return {"ok": True}


# ---------------- approval requests ----------------
# Single-step: one requester, one assigned approver. See workspace.py's module
# docstring for why this isn't the multi-tier chain the original spec sketched.
@router.get("/workspaces/{workspace_id}/approvals")
def list_approvals(workspace_id: int, status: str | None = None,
                   approver_user_id: int | None = None, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    return {"requests": ws.list_approval_requests(workspace_id, status, approver_user_id)}


@router.post("/workspaces/{workspace_id}/approvals")
def create_approval(workspace_id: int, body: ApprovalCreateBody, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    try:
        req = ws.create_approval_request(
            workspace_id, user["id"], body.title, body.approver_user_id,
            description=body.description, amount=body.amount, currency=body.currency,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"request": req}


@router.get("/workspaces/{workspace_id}/approvals/{request_id}")
def get_approval(workspace_id: int, request_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    req = ws.get_approval_request(workspace_id, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found.")
    return {"request": req}


@router.patch("/workspaces/{workspace_id}/approvals/{request_id}")
def decide_approval(workspace_id: int, request_id: int, body: ApprovalDecisionBody,
                    user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    req = ws.get_approval_request(workspace_id, request_id)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found.")

    if body.cancel:
        if req["requested_by"] != user["id"]:
            raise HTTPException(status_code=403, detail="Only the requester can cancel this request.")
        if req["status"] != "pending":
            raise HTTPException(status_code=400, detail="This request has already been decided.")
        ws.cancel_approval_request(workspace_id, request_id, actor_user_id=user["id"])
        return {"request": ws.get_approval_request(workspace_id, request_id)}

    if req["approver_user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the assigned approver can decide this request.")
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="This request has already been decided.")
    ws.decide_approval_request(workspace_id, request_id, body.approve, body.note, actor_user_id=user["id"])
    return {"request": ws.get_approval_request(workspace_id, request_id)}


@router.get("/workspaces/{workspace_id}/activity")
def list_activity(workspace_id: int, limit: int = 20, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    return {"activity": ws.list_activity(workspace_id, limit=limit)}


# ---------------- notifications ----------------
# Always scoped to the authenticated caller — there's no user_id query param
# here, on purpose, so there's no way to ask for someone else's notifications.
@router.get("/workspaces/{workspace_id}/notifications")
def list_notifications(workspace_id: int, unread_only: bool = False, limit: int = 30,
                       user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    notifications, unread_count = ws.list_notifications(workspace_id, user["id"], unread_only, limit)
    return {"notifications": notifications, "unread_count": unread_count}


@router.post("/workspaces/{workspace_id}/notifications/{notification_id}/read")
def mark_notification_read(workspace_id: int, notification_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    if not ws.mark_notification_read(workspace_id, user["id"], notification_id):
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"ok": True}


@router.post("/workspaces/{workspace_id}/notifications/read_all")
def mark_all_notifications_read(workspace_id: int, user=Depends(auth.current_user)):
    _require_member(workspace_id, user)
    ws.mark_all_notifications_read(workspace_id, user["id"])
    return {"ok": True}
