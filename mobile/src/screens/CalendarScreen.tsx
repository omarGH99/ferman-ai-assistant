import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { MIN_TOUCH, radius, space, type, weight } from "../theme/tokens";
import { useI18n } from "../i18n/I18nProvider";
import { useToast } from "../ui/ToastProvider";
import { useAppState } from "../state/StateProvider";
import { parseCommand } from "../services/api";
import { cleanTitle, parseTime } from "../utils/nlp";
import { addDays, iso, startOfWeek, todayISO } from "../utils/date";
import { SegmentControl, CalMode } from "../components/calendar/SegmentControl";
import { DayView } from "../components/calendar/DayView";
import { WeekView } from "../components/calendar/WeekView";
import { MonthView } from "../components/calendar/MonthView";
import { QuickAddModal } from "../components/calendar/QuickAddModal";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function CalendarScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { showToast } = useToast();
  const st = useAppState();
  const insets = useSafeAreaInsets();

  const [cur, setCur] = useState(startOfToday());
  const [mode, setMode] = useState<CalMode>("month");
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);

  function navStep(dir: 1 | -1) {
    if (mode === "day") setCur((c) => addDays(c, dir));
    else if (mode === "week") setCur((c) => addDays(c, 7 * dir));
    else setCur((c) => new Date(c.getFullYear(), c.getMonth() + dir, 1));
  }

  let title = "";
  if (mode === "day") title = cur.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  else if (mode === "week")
    title = "Week of " + startOfWeek(cur).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  else title = cur.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  async function submitQuickAdd(text: string) {
    if (!quickAddDate) return;
    const res = await parseCommand(text);
    st.addEvent({ title: cleanTitle(text, res.slots), date: quickAddDate, time: parseTime(text, res.slots) });
    setQuickAddDate(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.top}>
        <Pressable style={[styles.navBtn, { backgroundColor: theme.surface, borderColor: theme.line }]} onPress={() => navStep(-1)}>
          <Text style={{ color: theme.text, fontSize: 15 }}>‹</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Pressable style={[styles.navBtn, { backgroundColor: theme.surface, borderColor: theme.line }]} onPress={() => navStep(1)}>
          <Text style={{ color: theme.text, fontSize: 15 }}>›</Text>
        </Pressable>
        <Pressable
          style={[styles.smallBtn, { backgroundColor: theme.surface, borderColor: theme.line }]}
          onPress={() => setCur(startOfToday())}
        >
          <Text style={{ color: theme.muted, fontSize: 12 }}>{t("today")}</Text>
        </Pressable>
        {/* Adding was only possible from week view's per-day "+", so putting an
            event on a chosen date meant switching modes to find it. In day view
            this adds to the day on screen; elsewhere it adds to today, and month
            view still drills into a day first. */}
        <Pressable
          style={[styles.smallBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}
          onPress={() => setQuickAddDate(mode === "day" ? iso(cur) : todayISO())}
          accessibilityLabel={t("add")}
        >
          <Text style={{ color: theme.accentInk, fontSize: 15, fontWeight: "700" }}>+</Text>
        </Pressable>
      </View>

      <SegmentControl mode={mode} onChange={setMode} />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {mode === "day" && <DayView cur={cur} />}
        {mode === "week" && <WeekView cur={cur} onAddDay={setQuickAddDate} />}
        {mode === "month" && (
          <MonthView
            cur={cur}
            onSelectDay={(d) => {
              setCur(d);
              setMode("day");
            }}
          />
        )}
      </ScrollView>

      <QuickAddModal
        visible={quickAddDate != null}
        dateISO={quickAddDate}
        onCancel={() => setQuickAddDate(null)}
        onSubmit={submitQuickAdd}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  // 34pt was below the 44pt minimum both platforms ask for, on the two controls
  // you press most often on this screen. Raised to MIN_TOUCH rather than
  // patched with hitSlop, since there is room here for the real thing.
  navBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", fontWeight: weight.semibold, fontSize: type.md },
  smallBtn: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    height: MIN_TOUCH,
    alignItems: "center",
    justifyContent: "center",
  },
});
