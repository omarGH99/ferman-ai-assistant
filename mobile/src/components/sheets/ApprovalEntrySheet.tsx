import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { useToast } from "../../ui/ToastProvider";
import {
  ApprovalRequest, DebtCurrency, WorkspaceMember, cancelApprovalApi, createApprovalApi,
  decideApprovalApi, getApprovalApi, listMembersApi,
} from "../../services/workspace";

export function ApprovalEntrySheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeSheet, closeSheet, editingApprovalId } = useSheets();
  const { showToast } = useToast();

  const visible = activeSheet === "approvalEntry";
  const isNew = editingApprovalId === null;

  const [req, setReq] = useState<ApprovalRequest | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [approverId, setApproverId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<DebtCurrency>("USD");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!visible || !token || !activeWorkspace) return;
    setTitle("");
    setApproverId(null);
    setAmount("");
    setDescription("");
    setNote("");
    setReq(null);
    listMembersApi(token, activeWorkspace.id).then((list) => {
      setMembers(list);
      // Default to someone other than yourself when there is a choice — the
      // common case is asking someone else, not self-approving.
      if (isNew) setApproverId(list.find((m) => m.user_id !== user?.id)?.user_id ?? list[0]?.user_id ?? null);
    });
    if (!isNew && editingApprovalId) {
      setLoading(true);
      getApprovalApi(token, activeWorkspace.id, editingApprovalId)
        .then(setReq)
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingApprovalId]);

  async function onSave() {
    if (!token || !activeWorkspace || !title.trim() || !approverId) return;
    setSaving(true);
    try {
      const amt = amount.trim() ? parseFloat(amount) : undefined;
      await createApprovalApi(token, activeWorkspace.id, {
        title: title.trim(),
        approver_user_id: approverId,
        description: description.trim() || undefined,
        amount: amt,
        currency: amt ? currency : undefined,
      });
      showToast(t("diwan_saved"));
      closeSheet();
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function onDecide(approve: boolean) {
    if (!token || !activeWorkspace || !req) return;
    try {
      const updated = await decideApprovalApi(token, activeWorkspace.id, req.id, approve, note.trim() || undefined);
      setReq(updated);
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    }
  }

  async function onCancel() {
    if (!token || !activeWorkspace || !req) return;
    try {
      const updated = await cancelApprovalApi(token, activeWorkspace.id, req.id);
      setReq(updated);
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    }
  }

  if (isNew) {
    return (
      <BottomSheet visible={visible} onClose={closeSheet} title={t("appr_new")}>
        <Text style={[styles.label, { color: theme.muted }]}>{t("appr_request_title")}</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("appr_request_title")}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("appr_approver")}</Text>
        <View style={styles.chipRow}>
          {members.map((m) => (
            <Pressable
              key={m.user_id}
              onPress={() => setApproverId(m.user_id)}
              style={[styles.chip, { borderColor: approverId === m.user_id ? theme.accent : theme.line }]}
            >
              <Text style={{ fontSize: type.sm, color: approverId === m.user_id ? theme.accent : theme.muted }}>
                {m.username}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.label, { color: theme.muted }]}>{t("appr_amount")}</Text>
        <View style={styles.amountRow}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            style={[styles.input, { flex: 1, borderColor: theme.line, color: theme.text }]}
            placeholder="0"
            placeholderTextColor={theme.muted}
          />
          <View style={[styles.currencyToggle, { borderColor: theme.line }]}>
            {(["USD", "IQD"] as DebtCurrency[]).map((c) => {
              const on = c === currency;
              return (
                <Pressable key={c} onPress={() => setCurrency(c)} style={[styles.currencyOpt, { backgroundColor: on ? theme.chip : "transparent" }]}>
                  <Text style={{ fontSize: type.sm, fontWeight: on ? weight.bold : weight.regular, color: on ? theme.text : theme.muted }}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Text style={[styles.label, { color: theme.muted }]}>{t("appr_description")}</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("appr_description")}
          placeholderTextColor={theme.muted}
        />
        <Pressable
          onPress={onSave}
          disabled={saving || !title.trim() || !approverId}
          style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: saving || !title.trim() || !approverId ? 0.6 : 1 }]}
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

  if (loading || !req) {
    return (
      <BottomSheet visible={visible} onClose={closeSheet}>
        <ActivityIndicator color={theme.accent} style={{ marginTop: space.xl }} />
      </BottomSheet>
    );
  }

  const isMyDecision = req.status === "pending" && req.approver_user_id === user?.id;
  const isMyRequest = req.status === "pending" && req.requested_by === user?.id;
  // Cancelled is neutral, not a rejection — it's the requester changing their
  // mind, not a negative judgment from the approver — so it gets the same
  // muted color as pending rather than the danger color rejected uses.
  const statusColor = req.status === "approved" ? theme.accent : req.status === "rejected" ? theme.danger : theme.muted;

  return (
    <BottomSheet visible={visible} onClose={closeSheet} title={req.title}>
      <Text style={{ color: statusColor, fontWeight: weight.bold, fontSize: type.base }}>
        {t(`appr_status_${req.status}`)}
      </Text>
      {req.amount != null && (
        <Text style={{ color: theme.text, fontSize: type.xl, fontWeight: weight.bold, marginTop: space.sm, fontVariant: ["tabular-nums"] }}>
          {req.amount.toLocaleString()} {req.currency}
        </Text>
      )}
      {!!req.description && <Text style={{ color: theme.muted, fontSize: type.base, marginTop: space.sm }}>{req.description}</Text>}
      {!!req.decision_note && (
        <Text style={{ color: theme.muted, fontSize: type.sm, marginTop: space.sm }}>"{req.decision_note}"</Text>
      )}

      {isMyDecision ? (
        <>
          <Text style={[styles.label, { color: theme.muted, marginTop: space.lg }]}>{t("appr_note")}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            style={[styles.input, { borderColor: theme.line, color: theme.text }]}
            placeholder={t("appr_note")}
            placeholderTextColor={theme.muted}
          />
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.md }}>
            <Pressable onPress={() => onDecide(true)} style={[styles.saveBtn, { flex: 1, backgroundColor: theme.accent }]}>
              <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("appr_approve")}</Text>
            </Pressable>
            <Pressable onPress={() => onDecide(false)} style={[styles.saveBtn, { flex: 1, backgroundColor: theme.danger }]}>
              <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("appr_reject")}</Text>
            </Pressable>
          </View>
        </>
      ) : req.status === "pending" ? (
        <Text style={{ color: theme.muted, fontSize: type.sm, marginTop: space.lg }}>{t("appr_not_yours")}</Text>
      ) : null}

      {isMyRequest && (
        <Pressable onPress={onCancel} style={[styles.saveBtn, { marginTop: space.md, borderWidth: 1, borderColor: theme.danger }]}>
          <Text style={{ color: theme.danger, fontWeight: weight.bold }}>{t("appr_cancel")}</Text>
        </Pressable>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: type.xs, marginTop: space.md, marginBottom: space.xs },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, fontSize: type.md },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radius.round, borderWidth: 1 },
  amountRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  currencyToggle: { flexDirection: "row", borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  currencyOpt: { paddingVertical: space.md, paddingHorizontal: space.md },
  saveBtn: { borderRadius: radius.md, padding: space.md, alignItems: "center", marginTop: space.lg },
});
