import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RotatingFeedCard } from "./RotatingFeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { getHistory, HistoryItem } from "../../services/api";

export function HistoryCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getHistory().then((d) => {
      if (alive) {
        setItems(d.ok ? d.items : null);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <RotatingFeedCard half={half}
      title={t("f_history")} icon="history"
      items={items && items.length ? items.slice(0, 5) : null}
      loading={loading}
      emptyText={t("e_history")}
      keyExtractor={(h, i) => `${h.year}:${i}`}
      renderItem={(h, compact) => (
        <View style={styles.row}>
          <Text style={[styles.year, { color: theme.accent }]}>{h.year}</Text>
          <Text
            style={{ color: theme.text, fontSize: 13, lineHeight: 18, flex: 1 }}
            numberOfLines={compact ? 3 : undefined}
          >
            {h.text}
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  year: { fontSize: 13, fontWeight: "800", minWidth: 42 },
});
