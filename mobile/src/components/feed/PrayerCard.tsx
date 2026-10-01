import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RotatingFeedCard } from "./RotatingFeedCard";
import { FeedRow } from "./FeedRow";
import { useTheme } from "../../theme/ThemeProvider";
import { Icon } from "../../ui/Icon";
import { useI18n } from "../../i18n/I18nProvider";
import { getPrayerTimes, PrayerData, PrayerRow } from "../../services/prayer";

export function PrayerCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [data, setData] = useState<PrayerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getPrayerTimes().then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const next = data?.rows.find((r) => r.isNext) || null;

  // Deliberately not rotating like the other cards. Cycling through prayer
  // times would move the *next* one off screen, which is the only one anyone
  // needs at a glance — so the compact view pins it and "See all" opens the
  // full day plus the Qibla bearing.
  const sheet = data ? (
    <View>
      {data.rows.map((r, i) => (
        <FeedRow key={r.key} first={i === 0} time={r.label} text={r.time} highlighted={r.isNext} />
      ))}
      {/* Stated as a bearing, not drawn as an arrow: the web build has no
          reliable compass, and an arrow would imply it tracks the device. */}
      <FeedRow
        time={t("qibla")}
        text={`${Math.round(data.qibla)}° ${t("qibla_hint")}`}
        right={<Icon name="qibla" size={16} color={theme.muted} />}
      />
    </View>
  ) : null;

  return (
    <RotatingFeedCard half={half}
      title={t("f_prayer")} icon="prayer"
      right={data?.hijri ? <Text style={{ color: theme.muted, fontSize: 11 }}>{data.hijri}</Text> : null}
      items={next ? [next] : null}
      loading={loading}
      emptyText={t("e_prayer")}
      keyExtractor={(r) => r.key}
      itemHeight={52}
      sheetContent={sheet}
      seeAllCount={data ? data.rows.length : 0}
      renderItem={(r: PrayerRow) => (
        <View style={styles.next}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>{t("prayer_next")}</Text>
          <Text style={{ color: theme.accent, fontSize: 22, fontWeight: "700", marginTop: 1 }}>
            {r.label} · {r.time}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  next: { justifyContent: "center" },
});
