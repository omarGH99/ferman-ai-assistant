import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";

// Year view was navigation for its own sake: nobody plans reminders twelve
// months out at a glance, and it cost a quarter of the mode switcher.
export type CalMode = "day" | "week" | "month";
const MODES: CalMode[] = ["day", "week", "month"];

export function SegmentControl({ mode, onChange }: { mode: CalMode; onChange: (m: CalMode) => void }) {
  const { theme } = useTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.seg, { backgroundColor: theme.chip }]}>
      {MODES.map((m) => {
        const on = m === mode;
        return (
          <Pressable
            key={m}
            style={[styles.btn, on && { backgroundColor: theme.surface }]}
            onPress={() => onChange(m)}
          >
            <Text style={{ color: on ? theme.accent : theme.muted, fontWeight: on ? "600" : "400", fontSize: 13 }}>
              {t(m)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", borderRadius: 8, padding: 3, marginHorizontal: 12, marginBottom: 12 },
  btn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8 },
});
