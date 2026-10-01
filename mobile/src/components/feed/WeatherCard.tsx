import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FeedCard, FeedMuted } from "./FeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { getFeedWeather, FeedWeather } from "../../services/weather";

export function WeatherCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [data, setData] = useState<FeedWeather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getFeedWeather().then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <FeedCard title={t("f_weather")} icon="weather" half={half}>
      {loading ? (
        <FeedMuted text={t("f_loading")} />
      ) : !data ? (
        <FeedMuted text={t("e_weather")} />
      ) : (
        <View>
          {/* At half width the temperature and description stack instead of
              sitting on one line, and the place is dropped — it doesn't fit
              beside a second card. */}
          <View style={half ? undefined : styles.now}>
            <Text style={[half ? styles.tempHalf : styles.temp, { color: theme.accent }]}>
              {data.tempNow}°C
            </Text>
            <Text style={{ color: theme.muted, fontSize: 13 }} numberOfLines={1}>
              {t(data.descKey)}
            </Text>
          </View>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
            {half ? `${data.min}–${data.max}°C` : `${data.place} · ${data.min}–${data.max}°C today`}
          </Text>
        </View>
      )}
    </FeedCard>
  );
}

const styles = StyleSheet.create({
  now: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  temp: { fontSize: 30, fontWeight: "700" },
  tempHalf: { fontSize: 26, fontWeight: "700" },
});
