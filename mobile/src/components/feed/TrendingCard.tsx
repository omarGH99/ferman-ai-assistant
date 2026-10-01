import React, { useEffect, useState } from "react";
import { Linking, Pressable, Text } from "react-native";
import { RotatingFeedCard } from "./RotatingFeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { getTrending, NewsItem } from "../../services/api";

export function TrendingCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getTrending().then((d) => {
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
      title={t("f_trending")} icon="trending"
      right={<Text style={{ color: theme.muted, fontSize: 11 }}>Google News</Text>}
      items={items && items.length ? items.slice(0, 5) : null}
      loading={loading}
      emptyText={t("e_trending")}
      keyExtractor={(n) => n.url}
      renderItem={(n, compact) => (
        <Pressable onPress={() => Linking.openURL(n.url)} disabled={compact}>
          <Text
            style={{ color: theme.text, fontSize: 13, lineHeight: 18 }}
            numberOfLines={compact ? 2 : undefined}
          >
            {n.title}
          </Text>
        </Pressable>
      )}
    />
  );
}
