import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { FeedCard, FeedMuted } from "./FeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { getWeekForecast, weatherEmoji, DayForecast } from "../../services/weather";

// Short weekday names per UI language (0=Sun..6=Sat) — avoids relying on Intl,
// which is limited on the Hermes engine.
const WD: Record<string, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ar: ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"],
  ku: ["یەک", "دوو", "سێ", "چوار", "پێنج", "هەین", "شەم"],
};

export function ForecastCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const [days, setDays] = useState<DayForecast[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getWeekForecast().then((d) => {
      if (alive) {
        setDays(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const names = WD[lang] || WD.en;

  return (
    <FeedCard half={half} title={t("f_forecast")} icon="forecast">
      {loading ? (
        <FeedMuted text={t("f_loading")} />
      ) : !days ? (
        <FeedMuted text={t("e_forecast")} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {days.map((d, i) => (
            <View key={d.date} style={[styles.day, { borderColor: theme.line, backgroundColor: i === 0 ? theme.soft : "transparent" }]}>
              <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "600" }}>
                {i === 0 ? t("today_short") : names[d.weekdayIdx]}
              </Text>
              <Text style={{ fontSize: 22, marginVertical: 4 }}>{weatherEmoji(d.code)}</Text>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>{d.max}°</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{d.min}°</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </FeedCard>
  );
}

const styles = StyleSheet.create({
  day: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
    minWidth: 62,
  },
});
