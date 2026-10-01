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
  DiwanEntry, createDiwanApi, getDiwanApi, setDiwanRepliedApi, updateDiwanApi,
} from "../../services/workspace";

/** Doubles as the create form (editingDiwanId === null) and the entry detail
 * view — the wireframe drew these as two screens, but they share almost
 * every field, and BottomSheet already gives each mode its own render path. */
export function DiwanEntrySheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeSheet, closeSheet, editingDiwanId, diwanCreateDirection, diwanReplyToId, openNewDiwanEntry } = useSheets();
  const { showToast } = useToast();

  const visible = activeSheet === "diwanEntry";
  const isNew = editingDiwanId === null;

  const [entry, setEntry] = useState<DiwanEntry | null>(null);
  const [parent, setParent] = useState<DiwanEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entityName, setEntityName] = useState("");
  const [subject, setSubject] = useState("");
  const [department, setDepartment] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setEntityName("");
    setSubject("");
    setDepartment("");
    setAttachmentUrl("");
    setEntry(null);
    setParent(null);
    setEditing(false);
    if (!isNew && token && activeWorkspace && editingDiwanId) {
      setLoading(true);
      getDiwanApi(token, activeWorkspace.id, editingDiwanId)
        .then((e) => {
          setEntry(e);
          if (e.reply_to_id) getDiwanApi(token, activeWorkspace.id, e.reply_to_id).then(setParent);
        })
        .finally(() => setLoading(false));
    }
    if (isNew && diwanReplyToId && token && activeWorkspace) {
      getDiwanApi(token, activeWorkspace.id, diwanReplyToId).then(setParent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingDiwanId, diwanReplyToId]);

  async function onSave() {
    if (!token || !activeWorkspace || !entityName.trim()) return;
    setSaving(true);
    try {
      await createDiwanApi(token, activeWorkspace.id, {
        direction: diwanCreateDirection,
        entity_name: entityName.trim(),
        subject: subject.trim() || undefined,
        department: department.trim() || undefined,
        reply_to_id: diwanReplyToId ?? undefined,
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

  async function onToggleReplied() {
    if (!token || !activeWorkspace || !entry) return;
    const updated = await setDiwanRepliedApi(token, activeWorkspace.id, entry.id, !entry.replied);
    setEntry(updated);
  }

  function onStartEdit() {
    if (!entry) return;
    setEntityName(entry.entity_name);
    setSubject(entry.subject || "");
    setDepartment(entry.department || "");
    setAttachmentUrl(entry.attachment_url || "");
    setEditing(true);
  }

  async function onSaveEdit() {
    if (!token || !activeWorkspace || !entry || !entityName.trim()) return;
    setSaving(true);
    try {
      const updated = await updateDiwanApi(token, activeWorkspace.id, entry.id, {
        entity_name: entityName.trim(),
        subject: subject.trim(),
        department: department.trim(),
        attachment_url: attachmentUrl.trim(),
      });
      setEntry(updated);
      setEditing(false);
      showToast(t("diwan_saved"));
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setSaving(false);
    }
  }

  if (isNew) {
    return (
      <BottomSheet visible={visible} onClose={closeSheet} title={t("diwan_new_entry")}>
        {!!diwanReplyToId && (
          <View style={[styles.replyChip, { borderColor: theme.line, backgroundColor: theme.soft }]}>
            <Text style={{ color: theme.accent, fontSize: type.sm }}>
              ↩ {t("diwan_replying_to")}{" "}
              {parent ? `#${parent.serial_number} — ${parent.entity_name}` : `#${diwanReplyToId}`}
            </Text>
          </View>
        )}
        <Text style={[styles.label, { color: theme.muted }]}>{t("diwan_entity")}</Text>
        <TextInput
          value={entityName}
          onChangeText={setEntityName}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("diwan_entity")}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("diwan_subject")}</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("diwan_subject")}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("diwan_department")}</Text>
        <TextInput
          value={department}
          onChangeText={setDepartment}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("diwan_department")}
          placeholderTextColor={theme.muted}
        />
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
          disabled={saving || !entityName.trim()}
          style={[
            styles.saveBtn,
            { backgroundColor: theme.accent, opacity: saving || !entityName.trim() ? 0.6 : 1 },
          ]}
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

  if (loading || !entry) {
    return (
      <BottomSheet visible={visible} onClose={closeSheet}>
        <ActivityIndicator color={theme.accent} style={{ marginTop: space.xl }} />
      </BottomSheet>
    );
  }

  if (editing) {
    return (
      <BottomSheet visible={visible} onClose={closeSheet} title={t("diwan_new_entry")}>
        <Text style={[styles.label, { color: theme.muted }]}>{t("diwan_entity")}</Text>
        <TextInput
          value={entityName}
          onChangeText={setEntityName}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("diwan_subject")}</Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("diwan_department")}</Text>
        <TextInput
          value={department}
          onChangeText={setDepartment}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholderTextColor={theme.muted}
        />
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
            disabled={saving || !entityName.trim()}
            style={[styles.saveBtn, { flex: 1, backgroundColor: theme.accent, opacity: saving || !entityName.trim() ? 0.6 : 1 }]}
          >
            {saving ? <ActivityIndicator color={theme.accentInk} /> : <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("diwan_save")}</Text>}
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={closeSheet} title={`#${entry.serial_number} — ${entry.entity_name}`}>
      {!!entry.subject && (
        <Text style={{ color: theme.text, fontSize: type.base, marginBottom: space.sm }}>{entry.subject}</Text>
      )}
      {!!entry.department && (
        <View style={[styles.deptChip, { borderColor: theme.line }]}>
          <Text style={{ color: theme.muted, fontSize: type.xs }}>{entry.department}</Text>
        </View>
      )}
      <Text style={{ color: theme.muted, fontSize: type.sm, marginTop: space.sm }}>{entry.entry_date}</Text>
      {!!entry.reply_to_id && (
        <Text style={{ color: theme.accent, fontSize: type.sm, marginTop: space.sm }}>
          ↩ {t("diwan_replies_to")} {parent ? `#${parent.serial_number} — ${parent.entity_name}` : `#${entry.reply_to_id}`}
        </Text>
      )}
      {!!entry.attachment_url && (
        <Pressable onPress={() => Linking.openURL(entry.attachment_url!)}>
          <Text style={{ color: theme.accent, fontSize: type.sm, marginTop: space.sm }} numberOfLines={1}>
            📎 {t("diwan_attachment")}: {entry.attachment_url}
          </Text>
        </Pressable>
      )}

      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.xl }}>
        <Pressable
          onPress={() => openNewDiwanEntry(entry.direction === "incoming" ? "outgoing" : "incoming", entry.id)}
          style={[styles.saveBtn, { flex: 1, borderWidth: 1, borderColor: theme.line }]}
        >
          <Text style={{ color: theme.text, fontWeight: weight.bold }}>{t("diwan_reply")}</Text>
        </Pressable>
        <Pressable onPress={onStartEdit} style={[styles.saveBtn, { flex: 1, borderWidth: 1, borderColor: theme.line }]}>
          <Text style={{ color: theme.text, fontWeight: weight.bold }}>{t("diwan_edit")}</Text>
        </Pressable>
      </View>
      <Pressable
        onPress={onToggleReplied}
        style={[styles.saveBtn, { backgroundColor: entry.replied ? theme.chip : theme.accent }]}
      >
        <Text style={{ color: entry.replied ? theme.text : theme.accentInk, fontWeight: weight.bold }}>
          {t(entry.replied ? "diwan_mark_unreplied" : "diwan_mark_replied")}
        </Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: type.xs, marginTop: space.md, marginBottom: space.xs },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, fontSize: type.md },
  saveBtn: { borderRadius: radius.md, padding: space.md, alignItems: "center", marginTop: space.lg },
  deptChip: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.round,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    marginTop: space.sm,
  },
  replyChip: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm,
    marginBottom: space.md,
  },
});
