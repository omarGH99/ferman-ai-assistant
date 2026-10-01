import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { RotatingFeedCard } from "./RotatingFeedCard";
import { FeedMuted } from "./FeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import {
  getCrypto,
  getTopCrypto,
  shortCap,
  fmtPrice,
  CryptoCoin,
  CryptoMarketCoin,
} from "../../services/crypto";

export function CryptoCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [coins, setCoins] = useState<CryptoCoin[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [top, setTop] = useState<CryptoMarketCoin[] | null>(null);
  const [topLoading, setTopLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    getCrypto().then((c) => {
      if (alive) {
        setCoins(c);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // First open only — CoinGecko's free tier is rate-limited, so the heavier
  // markets call must not fire on every feed render.
  function loadTop() {
    if (top || topLoading) return;
    setTopLoading(true);
    getTopCrypto(10).then((d) => {
      setTop(d);
      setTopLoading(false);
    });
  }

  const change = (v: number) => (
    <Text style={{ color: v >= 0 ? theme.accent : theme.danger, fontSize: 12 }}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(1)}%
    </Text>
  );

  const table = (
    <View>
      <View style={[styles.tr, styles.th, { borderBottomColor: theme.line }]}>
        <Text style={[styles.cRank, { color: theme.muted }]}>#</Text>
        <Text style={[styles.cNameTxt, { color: theme.muted }]}>{t("cr_coin")}</Text>
        <Text style={[styles.cPrice, { color: theme.muted }]}>{t("cr_price")}</Text>
        <Text style={[styles.cChgTxt, { color: theme.muted }]}>24h</Text>
        <Text style={[styles.cCap, { color: theme.muted }]}>{t("cr_cap")}</Text>
      </View>
      {topLoading && <FeedMuted text={t("f_loading")} />}
      {!topLoading && !top && <FeedMuted text={t("e_crypto")} />}
      {top?.map((c) => (
        <View key={c.symbol + c.rank} style={[styles.tr, { borderBottomColor: theme.line }]}>
          <Text style={[styles.cRank, { color: theme.muted }]}>{c.rank}</Text>
          <View style={styles.cName}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>{c.symbol}</Text>
            <Text style={{ color: theme.muted, fontSize: 11 }} numberOfLines={1}>
              {c.name}
            </Text>
          </View>
          <Text style={[styles.cPrice, { color: theme.text }]}>${fmtPrice(c.price)}</Text>
          <View style={styles.cChg}>{change(c.change)}</View>
          <Text style={[styles.cCap, { color: theme.muted }]}>{shortCap(c.marketCap)}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <RotatingFeedCard half={half}
      title={t("f_crypto")} icon="crypto"
      right={<Text style={{ color: theme.muted, fontSize: 11 }}>USD · 24h</Text>}
      items={coins}
      loading={loading}
      emptyText={t("e_crypto")}
      keyExtractor={(c) => c.symbol}
      itemHeight={46}
      onOpen={loadTop}
      seeAllCount={10}
      sheetContent={table}
      renderItem={(c) => (
        <View style={styles.row}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>{c.symbol}</Text>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>
              ${fmtPrice(c.price)}
            </Text>
            {change(c.change)}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  tr: { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, gap: 6 },
  th: { paddingVertical: 6 },
  cRank: { width: 20, fontSize: 11 },
  cName: { flex: 1 },
  cNameTxt: { flex: 1, fontSize: 11 },
  cPrice: { width: 80, textAlign: "right", fontSize: 12 },
  cChg: { width: 60, alignItems: "flex-end" },
  cChgTxt: { width: 60, textAlign: "right", fontSize: 11 },
  cCap: { width: 52, textAlign: "right", fontSize: 11 },
});
