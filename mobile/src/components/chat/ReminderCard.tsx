import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n, isRtlText } from "../../i18n/I18nProvider";
import { ChatMessage } from "../../state/ChatProvider";
import { recurLabel } from "../../utils/date";
import { EventItem } from "../../state/types";
import { DateTimeField } from "./DateTimeField";

export interface CardEdit {
  title: string;
  date: string | null;
  time: string;
}

export function ReminderCard({
  msg,
  findConflict,
  onSave,
  onCancel,
}: {
  msg: ChatMessage;
  findConflict?: (date: string | null, time: string) => EventItem | null;
  onSave: (edit: CardEdit) => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const card = msg.card!;
  const [title, setTitle] = useState(card.title);
  const [date, setDate] = useState(card.date ?? "");
  const [time, setTime] = useState(card.time);
  const [conflict, setConflict] = useState<string | null>(null);

  const isRecurring = !!card.recur;
  const heading = card.kind === "alarm" ? t("rc_alarm") : t("rc_reminder");

  // Changing either field clears a stale "time taken" warning.
  const onChangeDate = (v: string) => {
    setDate(v);
    setConflict(null);
  };
  const onChangeTime = (v: string) => {
    setTime(v);
    setConflict(null);
  };

  function handleSave() {
    const d = date.trim() || null;
    const tt = time.trim();
    const clash = findConflict ? findConflict(d, tt) : null;
    if (clash) {
      setConflict(clash.title ? `${t("rc_taken")} · ${clash.title}` : t("rc_taken"));
      return;
    }
    onSave({ title: title.trim() || card.title, date: d, time: tt });
  }

  // ---- saved / discarded compact states ----
  if (card.status === "saved") {
    const bits = [card.title, card.time || null, isRecurring ? recurLabel({ recur: card.recur } as EventItem) : card.date]
      .filter(Boolean)
      .join(" · ");
    return (
      <View style={[styles.confirm, { backgroundColor: theme.soft }]}>
        <Text style={{ color: theme.accent, fontSize: 15 }}>✓</Text>
        <Text style={{ color: theme.text, fontWeight: "600", fontSize: 13, flexShrink: 1 }}>
          {t("rc_saved")}: {bits}
        </Text>
      </View>
    );
  }
  if (card.status === "cancelled") {
    return (
      <View style={[styles.confirm, { backgroundColor: theme.surface, borderColor: theme.line, borderWidth: 1 }]}>
        <Text style={{ color: theme.muted, fontSize: 13 }}>{t("rc_discarded")}</Text>
      </View>
    );
  }

  // ---- editable pending state ----
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.accent }]}>
      <Text style={[styles.heading, { color: theme.accent }]}>{heading}</Text>

      <Text style={[styles.label, { color: theme.muted }]}>{t("rc_title")}</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t("rc_title")}
        placeholderTextColor={theme.muted}
        style={[styles.input, { borderColor: theme.line, backgroundColor: theme.bg, color: theme.text,
          writingDirection: isRtlText(title) ? "rtl" : "ltr" }]}
      />

      <View style={styles.rowFields}>
        {!isRecurring && (
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.muted }]}>{t("rc_date")}</Text>
            <DateTimeField mode="date" value={date} placeholder={t("rc_date")} onChange={onChangeDate} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.muted }]}>{t("rc_time")}</Text>
          <DateTimeField mode="time" value={time} placeholder={t("rc_time_none")} onChange={onChangeTime} />
        </View>
      </View>

      {conflict && (
        <Text style={[styles.conflict, { color: theme.danger }]}>⚠ {conflict}</Text>
      )}

      {isRecurring && (
        <Text style={[styles.repeats, { color: theme.muted }]}>
          {t("rc_repeats")}: {recurLabel({ recur: card.recur } as EventItem)}
        </Text>
      )}

      <View style={styles.actions}>
        <Pressable style={[styles.btn, { borderColor: theme.line }]} onPress={onCancel}>
          <Text style={{ color: theme.muted, fontWeight: "600" }}>{t("cancel")}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.saveBtn, { backgroundColor: theme.accent }]}
          onPress={handleSave}
        >
          <Text style={{ color: theme.accentInk, fontWeight: "600" }}>{t("save")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: "flex-start", maxWidth: "92%", borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 12 },
  heading: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  label: { fontSize: 11, marginBottom: 4, marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 11, fontSize: 13 },
  rowFields: { flexDirection: "row", gap: 10 },
  repeats: { fontSize: 12, marginTop: 8 },
  conflict: { fontSize: 12, marginTop: 10, fontWeight: "600" },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 14 },
  btn: { borderWidth: 1, borderColor: "transparent", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 18 },
  saveBtn: { borderColor: "transparent" },
  confirm: {
    alignSelf: "flex-start",
    maxWidth: "88%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
});
