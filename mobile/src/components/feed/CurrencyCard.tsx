import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RotatingFeedCard } from "./RotatingFeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { getCurrency, toIQD, IQD_QUOTES } from "../../services/currency";

const FLAG: Record<string, string> = { USD: "🇺🇸", EUR: "🇪🇺", TRY: "🇹🇷", GBP: "🇬🇧" };

interface Quote {
  code: string;
  iqd: number;
}

export function CurrencyCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getCurrency().then((d) => {
      if (!alive) return;
      if (d) {
        const rows: Quote[] = [];
        for (const code of IQD_QUOTES) {
          const iqd = toIQD(d.rates, code);
          if (iqd != null) rows.push({ code, iqd });
        }
        setQuotes(rows.length ? rows : null);
      } else {
        setQuotes(null);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <RotatingFeedCard half={half}
      title={t("f_currency")} icon="currency"
      right={<Text style={{ color: theme.muted, fontSize: 11 }}>{t("cur_in_iqd")}</Text>}
      items={quotes}
      loading={loading}
      emptyText={t("e_currency")}
      keyExtractor={(q) => q.code}
      itemHeight={44}
      renderItem={(q) => (
        <View style={styles.row}>
          <Text style={{ color: theme.text, fontSize: 15 }}>
            {FLAG[q.code] || ""} 1 {q.code}
          </Text>
          <Text style={{ color: theme.accent, fontSize: 17, fontWeight: "700" }}>
            {Math.round(q.iqd).toLocaleString()}
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: "400" }}> IQD</Text>
          </Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
