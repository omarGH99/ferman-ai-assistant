import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useAppState } from "../../state/StateProvider";
import { EventRow } from "./EventRow";
import { addDays, eventsOnDate, iso, startOfWeek } from "../../utils/date";

export function WeekView({ cur, onAddDay }: { cur: Date; onAddDay: (dateISO: string) => void }) {
  const { theme } = useTheme();
  const st = useAppState();
  const start = startOfWeek(cur);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <View style={styles.wrap}>
      {days.map((d) => {
        const evs = eventsOnDate(st.events, d);
        return (
          <View key={iso(d)} style={styles.section}>
            <View style={styles.head}>
              <Text style={[styles.headText, { color: theme.text }]}>
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
              </Text>
              <Pressable onPress={() => onAddDay(iso(d))} hitSlop={6}>
                <Text style={{ color: theme.accent, fontSize: 22, lineHeight: 20 }}>＋</Text>
              </Pressable>
            </View>
            {!evs.length ? (
              <Text style={{ color: theme.muted, fontSize: 12, fontStyle: "italic", paddingBottom: 8 }}>—</Text>
            ) : (
              evs.map((e) => <EventRow key={e.id} event={e} />)
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 4 },
  section: { marginBottom: 14 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  headText: { fontSize: 13, fontWeight: "600" },
});
