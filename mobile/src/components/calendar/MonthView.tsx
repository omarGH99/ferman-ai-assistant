import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useAppState } from "../../state/StateProvider";
import { useHolidays } from "../../state/HolidaysProvider";
import { DOW, addDays, eventsOnDate, iso, sameISO, startOfWeek, todayISO } from "../../utils/date";

export function MonthView({ cur, onSelectDay }: { cur: Date; onSelectDay: (d: Date) => void }) {
  const { theme } = useTheme();
  const st = useAppState();
  const { holidayOn } = useHolidays();
  const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
  const start = startOfWeek(first);
  const today = todayISO();
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {DOW.map((d) => (
          <View key={d} style={styles.cellBox}>
            <Text style={[styles.dow, { color: theme.muted }]}>{d}</Text>
          </View>
        ))}
      </View>
      <View style={styles.row}>
        {cells.map((d) => {
          const inMonth = d.getMonth() === cur.getMonth();
          const count = eventsOnDate(st.events, d).length;
          const isToday = sameISO(d, today);
          const hol = holidayOn(iso(d));
          return (
            <View key={iso(d)} style={styles.cellBox}>
              <Pressable
                style={[
                  styles.cell,
                  {
                    // Holidays tint the cell rather than adding a number, so they
                    // never get confused with the user's own event count.
                    backgroundColor: hol ? theme.soft : theme.surface,
                    borderColor: isToday ? theme.accent : theme.line,
                    borderWidth: isToday ? 2 : 1,
                    opacity: inMonth ? 1 : 0.35,
                  },
                ]}
                onPress={() => onSelectDay(d)}
              >
                <Text style={{ color: theme.text, fontSize: 13 }}>{d.getDate()}</Text>
                {hol ? <View style={[styles.holDot, { backgroundColor: theme.accent }]} /> : null}
                {count ? <Text style={[styles.count, { color: theme.accent }]}>{count}</Text> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  cellBox: { width: `${100 / 7}%`, padding: 2 },
  dow: { fontSize: 11, textAlign: "center", paddingBottom: 4 },
  cell: { aspectRatio: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  count: { position: "absolute", bottom: 3, fontSize: 11, fontWeight: "700" },
  holDot: { position: "absolute", top: 4, right: 4, width: 5, height: 5, borderRadius: 8 },
});
