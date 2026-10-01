import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { FeedCard, FeedMuted } from "../feed/FeedCard";
import { space, type, weight } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { DebtEntry, listDebtApi } from "../../services/workspace";

/** Net owed per currency — never converted or summed across USD/IQD, since a
 * debt agreed in one currency isn't the same promise as one in the other. */
export function DebtSummaryCard() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { openDebt } = useSheets();
  const [entries, setEntries] = useState<DebtEntry[] | null>(null);

  useEffect(() => {
    if (!token || !activeWorkspace) return;
    let alive = true;
    listDebtApi(token, activeWorkspace.id, undefined, false).then((list) => {
      if (alive) setEntries(list);
    });
    return () => {
      alive = false;
    };
  }, [token, activeWorkspace]);

  const net: Record<string, number> = {};
  for (const e of entries || []) {
    const signed = e.direction === "they_owe_us" ? e.amount : -e.amount;
    net[e.currency] = (net[e.currency] || 0) + signed;
  }
  const currencies = Object.keys(net);

  return (
    <FeedCard title={t("debt_title")} onPressTitle={openDebt}>
      {entries === null ? (
        <FeedMuted text={t("f_loading")} />
      ) : currencies.length === 0 ? (
        <FeedMuted text={t("debt_empty")} />
      ) : (
        <View style={{ flexDirection: "row", gap: space.lg }}>
          {currencies.map((c) => (
            <Text
              key={c}
              style={{
                color: net[c] >= 0 ? theme.accent : theme.danger,
                fontSize: type.xl,
                fontWeight: weight.bold,
                fontVariant: ["tabular-nums"],
              }}
            >
              {net[c] >= 0 ? "+" : ""}
              {net[c].toLocaleString()} {c}
            </Text>
          ))}
        </View>
      )}
    </FeedCard>
  );
}
