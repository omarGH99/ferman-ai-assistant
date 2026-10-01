import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useAppState } from "../../state/StateProvider";
import { useHolidays } from "../../state/HolidaysProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { Icon } from "../../ui/Icon";
import { EventRow } from "./EventRow";
import { eventsOnDate, iso } from "../../utils/date";

export function DayView({ cur }: { cur: Date }) {
  const { theme } = useTheme();
  const st = useAppState();
  const { holidayOn, labelFor } = useHolidays();
  const { t } = useI18n();
  const evs = eventsOnDate(st.events, cur);
  const hol = holidayOn(iso(cur));

  return (
    <View style={styles.wrap}>
      {hol && (
        <View style={[styles.holiday, { backgroundColor: theme.soft }]}>
          <Icon name="holidays" size={15} color={theme.accent} />
          <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 13 }}>
            {labelFor(hol, t)}
          </Text>
        </View>
      )}
      {!evs.length ? (
        <Text style={{ color: theme.muted, fontSize: 12, fontStyle: "italic" }}>{t("no_tasks_today")}</Text>
      ) : (
        evs.map((e) => <EventRow key={e.id} event={e} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 4 },
  holiday: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 8,
    paddingVertical: 9, paddingHorizontal: 12, marginBottom: 10 },
});
