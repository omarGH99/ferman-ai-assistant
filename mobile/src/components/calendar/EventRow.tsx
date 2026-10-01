import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { isRtlText } from "../../i18n/I18nProvider";
import { StatusPill } from "../common/StatusPill";
import { useSheets } from "../../ui/SheetsProvider";
import { EventItem } from "../../state/types";
import { recurLabel } from "../../utils/date";

export function EventRow({ event }: { event: EventItem }) {
  const { theme } = useTheme();
  const { openEvent } = useSheets();

  return (
    <Pressable
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.line }]}
      onPress={() => openEvent(event.id)}
    >
      <Text style={[styles.time, { color: theme.accent }]}>{event.time || "·"}</Text>
      <View style={styles.titleWrap}>
        <Text style={{ color: theme.text, fontSize: 13, writingDirection: isRtlText(event.title) ? "rtl" : "ltr" }}>
          {event.title}
        </Text>
        {event.recur ? <Text style={{ color: theme.muted, fontSize: 11 }}>{recurLabel(event)}</Text> : null}
      </View>
      <StatusPill status={event.status} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 11,
    marginBottom: 7,
  },
  time: { fontWeight: "700", fontSize: 13, minWidth: 56 },
  titleWrap: { flex: 1 },
});
