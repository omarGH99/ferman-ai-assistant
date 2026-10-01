import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n, isRtlText } from "../../i18n/I18nProvider";
import { useAppState } from "../../state/StateProvider";
import { todayISO } from "../../utils/date";
import { DateTimeField } from "../chat/DateTimeField";

/** Type an item straight into a list.
 *
 * Until this existed the only way to add anything was to talk to the assistant
 * and hope the model classified it correctly — which left users of the weaker
 * languages with no way to add a shopping item at all. This is the fallback that
 * keeps the app usable while the model improves.
 */
export function AddToListRow({
  tab,
  list,
}: {
  tab: "tasks" | "reminders" | "alarms" | "shopping" | "contacts";
  /** Which named list a new shopping item joins; "" is the default. */
  list?: string;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const st = useAppState();
  const [text, setText] = useState("");
  const [time, setTime] = useState("");

  function submit() {
    const value = text.trim();
    if (!value) return;
    if (tab === "shopping") {
      st.addShoppingItem(value, list);
    } else if (tab === "contacts") {
      st.addContact(value, time);
    } else if (tab === "alarms") {
      // An alarm is an event tagged as one; the tab splits on that tag.
      st.addEvent({ title: value, date: todayISO(), time: time.trim(), kind: "alarm" });
    } else {
      // Dated today so it shows on the feed straight away rather than only
      // inside this sheet. A reminder is an item with a time, which is the same
      // rule the tabs split on — so the time field is what makes it one.
      st.addEvent({ title: value, date: todayISO(), time: tab === "reminders" ? time.trim() : "" });
    }
    setText("");
    setTime("");
  }

  const placeholder =
    tab === "shopping" ? t("add_item_ph")
    : tab === "reminders" ? t("add_reminder_ph")
    : tab === "alarms" ? t("add_alarm_ph")
    : tab === "contacts" ? t("add_contact_ph")
    : t("add_task_ph");

  // The second field is a time for scheduled things and a phone number for
  // people — same slot, different meaning, so it is labelled either way.
  const wantsTime = tab === "reminders" || tab === "alarms";

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          onSubmitEditing={submit}
          returnKeyType="done"
          style={[
            styles.input,
            {
              borderColor: theme.line,
              backgroundColor: theme.bg,
              color: theme.text,
              writingDirection: isRtlText(text) ? "rtl" : "ltr",
            },
          ]}
        />
        <Pressable
          onPress={submit}
          disabled={!text.trim()}
          style={[styles.btn, { backgroundColor: theme.accent, opacity: text.trim() ? 1 : 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel={placeholder}
          hitSlop={8}
        >
          <Text style={{ color: theme.accentInk, fontSize: 22, lineHeight: 22, fontWeight: "700" }}>+</Text>
        </Pressable>
      </View>
      {wantsTime && (
        <View style={styles.timeRow}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>{t("rc_time")}</Text>
          <View style={{ flex: 1 }}>
            <DateTimeField mode="time" value={time} placeholder={t("rc_time_none")} onChange={setTime} />
          </View>
        </View>
      )}
      {tab === "contacts" && (
        <View style={styles.timeRow}>
          <TextInput
            value={time}
            onChangeText={setTime}
            placeholder={t("contact_phone_ph")}
            placeholderTextColor={theme.muted}
            keyboardType="phone-pad"
            style={[styles.input, { borderColor: theme.line, backgroundColor: theme.bg, color: theme.text }]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { flex: 1, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  btn: { width: 42, height: 42, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
});
