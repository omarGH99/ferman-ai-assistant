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
import { whatsappNumber } from "../../services/deepLinks";
import {
  DebtCurrency, DebtEntry, createDebtApi, getDebtApi, setDebtSettledApi, updateDebtApi,
} from "../../services/workspace";

export function DebtEntrySheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeSheet, closeSheet, editingDebtId, debtCreateDirection } = useSheets();
  const { showToast } = useToast();

  const visible = activeSheet === "debtEntry";
  const isNew = editingDebtId === null;

  const [entry, setEntry] = useState<DebtEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partyName, setPartyName] = useState("");
  const [partyPhone, setPartyPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<DebtCurrency>("USD");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPartyName("");
    setPartyPhone("");
    setAmount("");
    setCurrency("USD");
    setNote("");
    setDueDate("");
    setEntry(null);
    setEditing(false);
    if (!isNew && token && activeWorkspace && editingDebtId) {
      setLoading(true);
      getDebtApi(token, activeWorkspace.id, editingDebtId)
        .then(setEntry)
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, editingDebtId]);

  async function onSave() {
    const amt = parseFloat(amount);
    if (!token || !activeWorkspace || !partyName.trim() || !amt || amt <= 0) return;
    setSaving(true);
    try {
      await createDebtApi(token, activeWorkspace.id, {
        party_name: partyName.trim(),
        direction: debtCreateDirection,
        amount: amt,
        currency,
        party_phone: partyPhone.trim() || undefined,
        note: note.trim() || undefined,
        due_date: dueDate.trim() || undefined,
      });
      showToast(t("diwan_saved"));
      closeSheet();
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setSaving(false);
    }
  }

  async function onToggleSettled() {
    if (!token || !activeWorkspace || !entry) return;
    const updated = await setDebtSettledApi(token, activeWorkspace.id, entry.id, !entry.settled);
    setEntry(updated);
  }

  function onStartEdit() {
    if (!entry) return;
    setPartyName(entry.party_name);
    setPartyPhone(entry.party_phone || "");
    setAmount(String(entry.amount));
    setCurrency(entry.currency);
    setNote(entry.note || "");
    setDueDate(entry.due_date || "");
    setEditing(true);
  }

  async function onSaveEdit() {
    const amt = parseFloat(amount);
    if (!token || !activeWorkspace || !entry || !partyName.trim() || !amt || amt <= 0) return;
    setSaving(true);
    try {
      const updated = await updateDebtApi(token, activeWorkspace.id, entry.id, {
        party_name: partyName.trim(),
        party_phone: partyPhone.trim(),
        amount: amt,
        currency,
        note: note.trim(),
        due_date: dueDate.trim(),
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

  function onRemind() {
    if (!entry?.party_phone) return;
    const text =
      entry.currency && entry.amount
        ? `${entry.party_name}: ${entry.amount.toLocaleString()} ${entry.currency}`
        : entry.party_name;
    whatsappNumber(entry.party_phone, text);
  }

  if (isNew) {
    return (
      <BottomSheet visible={visible} onClose={closeSheet} title={t("debt_new_entry")}>
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_party")}</Text>
        <TextInput
          value={partyName}
          onChangeText={setPartyName}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("debt_party")}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_phone")}</Text>
        <TextInput
          value={partyPhone}
          onChangeText={setPartyPhone}
          keyboardType="phone-pad"
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("debt_phone")}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_amount")}</Text>
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
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_note")}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder={t("debt_note")}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_due_date")}</Text>
        <TextInput
          value={dueDate}
          onChangeText={setDueDate}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.muted}
        />
        <Pressable
          onPress={onSave}
          disabled={saving || !partyName.trim() || !parseFloat(amount)}
          style={[
            styles.saveBtn,
            { backgroundColor: theme.accent, opacity: saving || !partyName.trim() || !parseFloat(amount) ? 0.6 : 1 },
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
      <BottomSheet visible={visible} onClose={closeSheet} title={t("debt_new_entry")}>
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_party")}</Text>
        <TextInput
          value={partyName}
          onChangeText={setPartyName}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_phone")}</Text>
        <TextInput
          value={partyPhone}
          onChangeText={setPartyPhone}
          keyboardType="phone-pad"
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_amount")}</Text>
        <View style={styles.amountRow}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            style={[styles.input, { flex: 1, borderColor: theme.line, color: theme.text }]}
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
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_note")}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholderTextColor={theme.muted}
        />
        <Text style={[styles.label, { color: theme.muted }]}>{t("debt_due_date")}</Text>
        <TextInput
          value={dueDate}
          onChangeText={setDueDate}
          style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.muted}
        />
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.lg }}>
          <Pressable onPress={() => setEditing(false)} style={[styles.saveBtn, { flex: 1, borderWidth: 1, borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontWeight: weight.bold }}>{t("cancel")}</Text>
          </Pressable>
          <Pressable
            onPress={onSaveEdit}
            disabled={saving || !partyName.trim() || !parseFloat(amount)}
            style={[styles.saveBtn, { flex: 1, backgroundColor: theme.accent, opacity: saving || !partyName.trim() || !parseFloat(amount) ? 0.6 : 1 }]}
          >
            {saving ? <ActivityIndicator color={theme.accentInk} /> : <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("diwan_save")}</Text>}
          </Pressable>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={closeSheet} title={entry.party_name}>
      <Text style={{ color: theme.accent, fontWeight: weight.bold, fontSize: type.xl, fontVariant: ["tabular-nums"] }}>
        {entry.amount.toLocaleString()} {entry.currency}
      </Text>
      {!!entry.note && <Text style={{ color: theme.muted, fontSize: type.base, marginTop: space.sm }}>{entry.note}</Text>}
      {!!entry.due_date && (
        <Text style={{ color: theme.muted, fontSize: type.sm, marginTop: space.sm }}>
          {t("debt_due_date")}: {entry.due_date}
        </Text>
      )}

      <Pressable
        onPress={onRemind}
        disabled={!entry.party_phone}
        style={[styles.saveBtn, { backgroundColor: theme.chip, marginTop: space.xl, opacity: entry.party_phone ? 1 : 0.5 }]}
      >
        <Text style={{ color: theme.text, fontWeight: weight.bold }}>
          {entry.party_phone ? t("debt_send_reminder") : t("debt_no_phone")}
        </Text>
      </Pressable>

      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
        <Pressable onPress={onStartEdit} style={[styles.saveBtn, { flex: 1, borderWidth: 1, borderColor: theme.line }]}>
          <Text style={{ color: theme.text, fontWeight: weight.bold }}>{t("diwan_edit")}</Text>
        </Pressable>
        <Pressable
          onPress={onToggleSettled}
          style={[styles.saveBtn, { flex: 1, backgroundColor: entry.settled ? theme.chip : theme.accent }]}
        >
          <Text style={{ color: entry.settled ? theme.text : theme.accentInk, fontWeight: weight.bold }}>
            {t(entry.settled ? "debt_mark_unsettled" : "debt_mark_settled")}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: type.xs, marginTop: space.md, marginBottom: space.xs },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, fontSize: type.md },
  amountRow: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  currencyToggle: { flexDirection: "row", borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  currencyOpt: { paddingVertical: space.md, paddingHorizontal: space.md },
  saveBtn: { borderRadius: radius.md, padding: space.md, alignItems: "center", marginTop: space.lg },
});
