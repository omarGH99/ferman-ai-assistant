import React, { useEffect, useState } from "react";
import { Linking, Pressable, Text } from "react-native";
import { RotatingFeedCard } from "./RotatingFeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { getNews, NewsItem } from "../../services/api";

export function NewsCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const [items, setItems] = useState<NewsItem[] | null>(null);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);

  // Refetch when the UI language changes — the feed itself is language-specific
  // (Kurdish → Kurdistan24, Arabic/English → Google News Iraq).
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getNews(lang).then((d) => {
      if (alive) {
        setItems(d.ok ? d.items : null);
        setSource(d.source || "");
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [lang]);

  return (
    <RotatingFeedCard half={half}
      title={t("f_news")} icon="news"
      right={<Text style={{ color: theme.muted, fontSize: 11 }}>{source}</Text>}
      items={items && items.length ? items.slice(0, 5) : null}
      loading={loading}
      emptyText={t("e_news")}
      keyExtractor={(n) => n.url}
      renderItem={(n, compact) => (
        // In the rotating view the whole card is the tap target (it opens the
        // full list), so the headline itself must not swallow the press.
        <Pressable onPress={() => Linking.openURL(n.url)} disabled={compact}>
          <Text
            style={{
              color: theme.text,
              fontSize: 13,
              lineHeight: 18,
              // Headlines follow the feed's script, not a fixed direction —
              // English Iraq headlines were rendering right-to-left before.
              writingDirection: lang === "en" ? "ltr" : "rtl",
            }}
            numberOfLines={compact ? 2 : undefined}
          >
            {n.title}
          </Text>
        </Pressable>
      )}
    />
  );
}
