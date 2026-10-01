import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { FeedCard, FeedMuted } from "./FeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { getAirQuality, dustLevel, AirQuality, AqiBand } from "../../services/airQuality";

const BAND_KEY: Record<AqiBand, string> = {
  good: "aq_good",
  fair: "aq_fair",
  moderate: "aq_moderate",
  poor: "aq_poor",
  very_poor: "aq_very_poor",
  extreme: "aq_extreme",
};

export function AirQualityCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [data, setData] = useState<AirQuality | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getAirQuality().then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Only the bad end gets the danger colour — colouring every band turns the
  // feed into a traffic light and stops "red" meaning anything.
  const bandColour = (band: AqiBand) =>
    band === "good" || band === "fair" ? theme.accent
      : band === "moderate" ? theme.text
      : theme.danger;

  return (
    <FeedCard title={t("f_air")} icon="air" half={half}>
      {loading ? (
        <FeedMuted text={t("f_loading")} />
      ) : !data ? (
        <FeedMuted text={t("e_air")} />
      ) : (
        <View>
          {/* Half width can't fit the pollutant breakdown on one line, so it
              drops to PM2.5 and UV — the two a person acts on. */}
          <View style={half ? undefined : styles.now}>
            <Text style={[half ? styles.aqiHalf : styles.aqi, { color: bandColour(data.band) }]}>
              {data.aqi}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 13 }} numberOfLines={1}>
              {t(BAND_KEY[data.band])}
            </Text>
          </View>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
            {half
              ? `PM2.5 ${data.pm25} · UV ${data.uv}`
              : `${data.place} · PM2.5 ${data.pm25} · PM10 ${data.pm10} · UV ${data.uv}`}
          </Text>
          {/* The reason this widget exists: a dust storm can leave PM2.5 looking
              ordinary while dust and PM10 spike, so it gets its own line. */}
          {dustLevel(data.dust) !== "low" && (
            <Text
              style={{
                color: dustLevel(data.dust) === "high" ? theme.danger : theme.muted,
                fontSize: 12,
                marginTop: 5,
                fontWeight: "600",
              }}
            >
              {dustLevel(data.dust) === "high" ? t("aq_dust_high") : t("aq_dust_notable")} ·{" "}
              {data.dust} µg/m³
            </Text>
          )}
        </View>
      )}
    </FeedCard>
  );
}

const styles = StyleSheet.create({
  now: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  aqi: { fontSize: 30, fontWeight: "700" },
  aqiHalf: { fontSize: 26, fontWeight: "700" },
});
