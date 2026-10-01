import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { RotatingFeedCard } from "./RotatingFeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { Holiday } from "../../services/api";
import { useHolidays } from "../../state/HolidaysProvider";
import { todayISO } from "../../utils/date";

/** Whole days from today. The API returns dates only, so this is a plain UTC
 * date subtraction — no time-of-day to get wrong. */
function daysAway(iso: string): number {
  const a = Date.parse(iso + "T00:00:00Z");
  const b = Date.parse(todayISO() + "T00:00:00Z");
  return Math.round((a - b) / 86400000);
}

/** DD/MM — numeric so it reads the same in all three languages, rather than
 * needing month names translated three ways. */
function shortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function HolidaysCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { holidays, loading, labelFor } = useHolidays();
  const items = holidays.length ? holidays : null;

  const label = (h: Holiday) => labelFor(h, t);

  return (
    <RotatingFeedCard half={half}
      title={t("f_holidays")} icon="holidays"
      items={items}
      loading={loading}
      emptyText={t("e_holidays")}
      keyExtractor={(h) => `${h.date}:${h.name}`}
      itemHeight={50}
      renderItem={(h) => {
        const d = daysAway(h.date);
        return (
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
                {label(h)}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                {shortDate(h.date)}
              </Text>
            </View>
            <Text style={{ color: theme.accent, fontSize: 13, fontWeight: "700" }}>
              {d === 0 ? t("hol_today") : d === 1 ? t("hol_tomorrow") : `${d} ${t("hol_days")}`}
            </Text>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
