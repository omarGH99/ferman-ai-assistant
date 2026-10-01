import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { STATUS_LABEL_KEYS } from "../../i18n/strings";
import { useSheets } from "../../ui/SheetsProvider";
import { useAppState } from "../../state/StateProvider";
import { addToGoogleCalendar } from "../../services/deepLinks";
import { useToast } from "../../ui/ToastProvider";
import { Status } from "../../state/types";
import { recurLabel } from "../../utils/date";

const STATUS_ORDER: Status[] = ["pending", "inprogress", "done", "attended"];

export function EventDetailSheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { activeSheet, editingEventId, closeSheet } = useSheets();
  const st = useAppState();
  const { showToast } = useToast();
  const [notes, setNotes] = useState("");

  const event = st.events.find((e) => e.id === editingEventId) || null;

  useEffect(() => {
    setNotes(event?.notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEventId]);

  if (!event) {
    return <BottomSheet visible={activeSheet === "event"} onClose={closeSheet} />;
  }

  const when = event.recur
    ? `${recurLabel(event)}  ${event.recur.from} → ${event.recur.to}`
    : event.date || "";
  const whenLine = when + (event.time ? "  ·  " + event.time : "");

  return (
    <BottomSheet visible={activeSheet === "event"} onClose={closeSheet} title={event.title}>
      <Text style={[styles.when, { color: theme.muted }]}>{whenLine}</Text>

      <View style={styles.statusRow}>
        {STATUS_ORDER.map((s) => {
          const selected = event.status === s;
          return (
            <Pressable
              key={s}
              onPress={() => st.setEventStatus(event.id, s)}
              style={[
                styles.statusBtn,
                {
                  borderColor: selected ? theme.accent : theme.line,
                  backgroundColor: selected ? theme.soft : theme.surface,
                },
              ]}
            >
              <Text style={{ color: selected ? theme.accent : theme.muted, fontWeight: selected ? "600" : "400", fontSize: 12 }}>
                {t(STATUS_LABEL_KEYS[s])}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder={t("notes_ph")}
        placeholderTextColor={theme.muted}
        multiline
        style={[styles.notes, { borderColor: theme.line, backgroundColor: theme.surface, color: theme.text }]}
      />

      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, { backgroundColor: theme.accent }]}
          onPress={() => {
            st.updateEvent(event.id, { notes });
            closeSheet();
            showToast(t("saved_toast"));
          }}
        >
          <Text style={{ color: theme.accentInk, fontSize: 13 }}>{t("save")}</Text>
        </Pressable>
        {/* Pushes the reminder into the user's real calendar, which will alert
            them even when this app's tab is closed — the one thing web
            notifications cannot do. */}
        {!!event.date && (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line }]}
            onPress={() => addToGoogleCalendar(event.title, event.date!, event.time, event.notes)}
          >
            <Text style={{ color: theme.text, fontSize: 13 }}>{t("add_to_calendar")}</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.actionBtn, { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.line }]}
          onPress={() => {
            // Capture before deleting so undo restores this exact item —
            // same id, same status — rather than creating a lookalike.
            const removed = event;
            st.deleteEvent(event.id);
            closeSheet();
            showToast(t("deleted"), {
              label: t("undo"),
              onPress: () => st.restoreEvent(removed),
            });
          }}
        >
          <Text style={{ color: theme.danger, fontSize: 13 }}>{t("delete")}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  when: { fontSize: 13, marginBottom: 12 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  statusBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10 },
  notes: { borderWidth: 1, borderRadius: 12, padding: 10, minHeight: 70, fontSize: 13, marginBottom: 12, textAlignVertical: "top" },
  actions: { flexDirection: "row", gap: 8, marginBottom: 12 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 11, alignItems: "center" },
});
