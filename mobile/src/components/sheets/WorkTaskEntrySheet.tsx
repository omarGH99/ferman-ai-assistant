import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { useToast } from "../../ui/ToastProvider";
import {
  ChecklistItem, TaskComment, TaskStatus, WorkTask, WorkspaceMember, addChecklistItemApi,
  addTaskCommentApi, createTaskApi, deleteChecklistItemApi, getTaskApi, listChecklistApi,
  listMembersApi, listTaskCommentsApi, updateChecklistItemApi, updateTaskApi,
} from "../../services/workspace";

const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done"];

function StatusChips({
  value,
  onChange,
}: {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.chipRow}>
      {TASK_STATUSES.map((s) => {
        const on = s === value;
        return (
          <Pressable
            key={s}
            onPress={() => onChange(s)}
            style={[styles.chip, { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.chip : "transparent" }]}
          >
            <Text style={{ fontSize: type.sm, fontWeight: on ? weight.bold : weight.regular, color: on ? theme.accent : theme.muted }}>
              {t(`tasks_status_${s}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function WorkTaskEntrySheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeSheet, closeSheet, editingTaskId } = useSheets();
  const { showToast } = useToast();

  const visible = activeSheet === "workTaskEntry";
  const isNew = editingTaskId === null;

  const [task, setTask] = useState<WorkTask | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [checklistTitle, setChecklistTitle] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!visible || !token || !activeWorkspace) return;
    setTitle("");
    setAssigneeId(null);
    setDueDate("");
    setStatus("todo");
    setAttachmentUrl("");
    setTask(null);
    setComments([]);
    setCommentBody("");
    setChecklist([]);
    setChecklistTitle("");
    setEditing(false);
    listMembersApi(token, activeWorkspace.id).then(setMembers);
    if (!isNew && editingTaskId) {
      setLoading(true);
      getTaskApi(token, activeWorkspace.id, editingTaskId)
        .then(setTask)
        .finally(() => setLoading(false));
      listTaskCommentsApi(token, activeWorkspace.id, editingTaskId).then(setComments);
      listChecklistApi(token, activeWorkspace.id, editingTaskId).then(setChecklist);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingTaskId]);

  async function onSave() {
    if (!token || !activeWorkspace || !title.trim()) return;
    setSaving(true);
    try {
      await createTaskApi(token, activeWorkspace.id, {
        title: title.trim(),
        assignee_user_id: assigneeId ?? undefined,
        due_date: dueDate.trim() || undefined,
        status,
        attachment_url: attachmentUrl.trim() || undefined,
      });
      showToast(t("diwan_saved"));
      closeSheet();
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function onSetStatus(s: TaskStatus) {
    if (!token || !activeWorkspace || !task) return;
    const updated = await updateTaskApi(token, activeWorkspace.id, task.id, { status: s });
    setTask(updated);
  }

  function onStartEdit() {
    if (!task) return;
    setTitle(task.title);
    setAssigneeId(task.assignee_user_id);
    setDueDate(task.due_date || "");
    setStatus(task.status);
    setAttachmentUrl(task.attachment_url || "");
    setEditing(true);
  }

  async function onSaveEdit() {
    if (!token || !activeWorkspace || !task || !title.trim()) return;
    setSaving(true);
    try {
      // assignee_user_id is sent explicitly either way (a member id or null)
      // rather than omitted — this form always shows a definite selection,
      // so there's no "leave it alone" case for it to express here.
      const updated = await updateTaskApi(token, activeWorkspace.id, task.id, {
        title: title.trim(),
        assignee_user_id: assigneeId,
        due_date: dueDate.trim(),
        status,
        attachment_url: attachmentUrl.trim(),
      });
      setTask(updated);
      setEditing(false);
      showToast(t("diwan_saved"));
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function onPostComment() {
    if (!token || !activeWorkspace || !task || !commentBody.trim()) return;
    setPostingComment(true);
    try {
      const comment = await addTaskCommentApi(token, activeWorkspace.id, task.id, commentBody.trim());
      setComments((prev) => [...prev, comment]);
      setCommentBody("");
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setPostingComment(false);
    }
  }

  async function onAddChecklistItem() {
    if (!token || !activeWorkspace || !task || !checklistTitle.trim()) return;
    setAddingItem(true);
    try {
      const item = await addChecklistItemApi(token, activeWorkspace.id, task.id, checklistTitle.trim());
      setChecklist((prev) => [...prev, item]);
      setChecklistTitle("");
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setAddingItem(false);
    }
  }

  async function onToggleChecklistItem(item: ChecklistItem) {
    if (!token || !activeWorkspace || !task) return;
    const updated = await updateChecklistItemApi(token, activeWorkspace.id, task.id, item.id, { done: !item.done });
    setChecklist((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  }

  async function onDeleteChecklistItem(item: ChecklistItem) {
    if (!token || !activeWorkspace || !task) return;
    await deleteChecklistItemApi(token, activeWorkspace.id, task.id, item.id);
    setChecklist((prev) => prev.filter((x) => x.id !== item.id));
  }

  if (isNew) {
    return (
      <BottomSheet visible={visible} onClose={closeSheet} title={t("tasks_new")}>
        <Text style={[styles.label, { color: theme.muted }]}>{t("tasks_task_title")}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("tasks_task_title")}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("tasks_assignee")}</Text>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setAssigneeId(null)}
            style={[styles.chip, { borderColor: assigneeId === null ? theme.accent : theme.line }]}
          >
            <Text style={{ fontSize: type.sm, color: assigneeId === null ? theme.accent : theme.muted }}>
              {t("tasks_unassigned")}
            </Text>
          </Pressable>
          {members.map((m) => (
            <Pressable
              key={m.user_id}
              onPress={() => setAssigneeId(m.user_id)}
              style={[styles.chip, { borderColor: assigneeId === m.user_id ? theme.accent : theme.line }]}
            >
              <Text style={{ fontSize: type.sm, color: assigneeId === m.user_id ? theme.accent : theme.muted }}>
                {m.username}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.label, { color: theme.muted }]}>{t("tasks_due_date")}</Text>
        <TextInput
          value={dueDate}
          onChangeText={setDueDate}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("tasks_status")}</Text>
        <StatusChips value={status} onChange={setStatus} />
        <Text style={[styles.label, { color: theme.muted }]}>{t("diwan_attachment")}</Text>
        <TextInput
          value={attachmentUrl}
          onChangeText={setAttachmentUrl}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("diwan_attachment_placeholder")}
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          keyboardType="url"
        />
        <Pressable
          onPress={onSave}
          disabled={saving || !title.trim()}
          style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: saving || !title.trim() ? 0.6 : 1 }]}
        >
          {saving ? (
            <ActivityIndicator color={theme.accentInk} />
          ) : (
            <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("diwan_save")}</Text>
          )}
        </Pressable>
      </BottomSheet>
    );
  }

  if (loading || !task) {
    return (
      <BottomSheet visible={visible} onClose={closeSheet}>
        <ActivityIndicator color={theme.accent} style={{ marginTop: space.xl }} />
      </BottomSheet>
    );
  }

  const assignee = members.find((m) => m.user_id === task.assignee_user_id);

  if (editing) {
    return (
      <BottomSheet visible={visible} onClose={closeSheet} title={t("tasks_new")}>
        <Text style={[styles.label, { color: theme.muted }]}>{t("tasks_task_title")}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("tasks_assignee")}</Text>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setAssigneeId(null)}
            style={[styles.chip, { borderColor: assigneeId === null ? theme.accent : theme.line }]}
          >
            <Text style={{ fontSize: type.sm, color: assigneeId === null ? theme.accent : theme.muted }}>
              {t("tasks_unassigned")}
            </Text>
          </Pressable>
          {members.map((m) => (
            <Pressable
              key={m.user_id}
              onPress={() => setAssigneeId(m.user_id)}
              style={[styles.chip, { borderColor: assigneeId === m.user_id ? theme.accent : theme.line }]}
            >
              <Text style={{ fontSize: type.sm, color: assigneeId === m.user_id ? theme.accent : theme.muted }}>
                {m.username}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.label, { color: theme.muted }]}>{t("tasks_due_date")}</Text>
        <TextInput
          value={dueDate}
          onChangeText={setDueDate}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("tasks_status")}</Text>
        <StatusChips value={status} onChange={setStatus} />
        <Text style={[styles.label, { color: theme.muted }]}>{t("diwan_attachment")}</Text>
        <TextInput
          value={attachmentUrl}
          onChangeText={setAttachmentUrl}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("diwan_attachment_placeholder")}
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          keyboardType="url"
        />
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.lg }}>
          <Pressable onPress={() => setEditing(false)} style={[styles.saveBtn, { flex: 1, borderWidth: 1, borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontWeight: weight.bold }}>{t("cancel")}</Text>
          </Pressable>
          <Pressable
            onPress={onSaveEdit}
            disabled={saving || !title.trim()}
            style={[styles.saveBtn, { flex: 1, backgroundColor: theme.accent, opacity: saving || !title.trim() ? 0.6 : 1 }]}
          >
            {saving ? <ActivityIndicator color={theme.accentInk} /> : <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("diwan_save")}</Text>}
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={closeSheet} title={task.title}>
      <Text style={{ color: theme.muted, fontSize: type.base }}>
        {assignee ? assignee.username : t("tasks_unassigned")}
        {!!task.due_date && `  ·  ${task.due_date}`}
      </Text>

      <Text style={[styles.label, { color: theme.muted, marginTop: space.lg }]}>{t("tasks_status")}</Text>
      <StatusChips value={task.status} onChange={onSetStatus} />

      {!!task.attachment_url && (
        <Pressable onPress={() => Linking.openURL(task.attachment_url!)}>
          <Text style={{ color: theme.accent, fontSize: type.sm, marginTop: space.sm }} numberOfLines={1}>
            📎 {t("diwan_attachment")}: {task.attachment_url}
          </Text>
        </Pressable>
      )}

      <Pressable onPress={onStartEdit} style={[styles.saveBtn, { borderWidth: 1, borderColor: theme.line }]}>
        <Text style={{ color: theme.text, fontWeight: weight.bold }}>{t("diwan_edit")}</Text>
      </Pressable>

      <Text style={[styles.label, { color: theme.muted, marginTop: space.xl }]}>
        {t("tasks_checklist")}
        {checklist.length > 0 && `  (${checklist.filter((i) => i.done).length}/${checklist.length})`}
      </Text>
      {checklist.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: type.sm }}>{t("tasks_checklist_empty")}</Text>
      ) : (
        <View style={{ gap: space.xs }}>
          {checklist.map((item) => (
            <View key={item.id} style={styles.checklistRow}>
              <Pressable
                onPress={() => onToggleChecklistItem(item)}
                style={[styles.cbx, { borderColor: theme.line, backgroundColor: item.done ? theme.accent : "transparent" }]}
                hitSlop={8}
              >
                {item.done ? <Text style={{ color: theme.accentInk, fontSize: type.xs }}>✓</Text> : null}
              </Pressable>
              <Text
                style={{
                  flex: 1,
                  color: item.done ? theme.muted : theme.text,
                  textDecorationLine: item.done ? "line-through" : "none",
                  fontSize: type.sm,
                }}
              >
                {item.title}
              </Text>
              <Pressable onPress={() => onDeleteChecklistItem(item)} hitSlop={8}>
                <Text style={{ color: theme.muted, fontSize: type.sm }}>✕</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm, alignItems: "center" }}>
        <TextInput
          value={checklistTitle}
          onChangeText={setChecklistTitle}
          style={[styles.input, { flex: 1, borderColor: theme.line, color: theme.text }]}
          placeholder={t("tasks_checklist_placeholder")}
          placeholderTextColor={theme.muted}
        />
        <Pressable
          onPress={onAddChecklistItem}
          disabled={addingItem || !checklistTitle.trim()}
          style={[styles.saveBtn, { marginTop: 0, backgroundColor: theme.accent, opacity: addingItem || !checklistTitle.trim() ? 0.6 : 1 }]}
        >
          {addingItem ? (
            <ActivityIndicator color={theme.accentInk} />
          ) : (
            <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("tasks_add_item")}</Text>
          )}
        </Pressable>
      </View>

      <Text style={[styles.label, { color: theme.muted, marginTop: space.xl }]}>{t("tasks_comments")}</Text>
      {comments.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: type.sm }}>{t("tasks_comments_empty")}</Text>
      ) : (
        <View style={{ gap: space.sm }}>
          {comments.map((c) => (
            <View key={c.id} style={[styles.commentBubble, { borderColor: theme.line }]}>
              <Text style={{ color: theme.text, fontSize: type.sm, fontWeight: weight.semibold }}>{c.author_username}</Text>
              <Text style={{ color: theme.text, fontSize: type.sm, marginTop: 2 }}>{c.body}</Text>
              <Text style={{ color: theme.muted, fontSize: type.xs, marginTop: 2 }}>
                {new Date(c.created_at).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm, alignItems: "center" }}>
        <TextInput
          value={commentBody}
          onChangeText={setCommentBody}
          style={[styles.input, { flex: 1, borderColor: theme.line, color: theme.text }]}
          placeholder={t("tasks_comment_placeholder")}
          placeholderTextColor={theme.muted}
        />
        <Pressable
          onPress={onPostComment}
          disabled={postingComment || !commentBody.trim()}
          style={[styles.saveBtn, { marginTop: 0, backgroundColor: theme.accent, opacity: postingComment || !commentBody.trim() ? 0.6 : 1 }]}
        >
          {postingComment ? (
            <ActivityIndicator color={theme.accentInk} />
          ) : (
            <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("tasks_add_comment")}</Text>
          )}
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: type.xs, marginTop: space.md, marginBottom: space.xs },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, fontSize: type.md },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radius.round, borderWidth: 1 },
  saveBtn: { borderRadius: radius.md, padding: space.md, alignItems: "center", marginTop: space.lg },
  commentBubble: { borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  checklistRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  cbx: { width: 20, height: 20, borderRadius: radius.sm, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});
