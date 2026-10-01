import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FeedCard, FeedMuted } from "../feed/FeedCard";
import { space, type, weight } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { DebtEntry, listDebtApi } from "../../services/workspace";

/** Unsettled debt entries with a due date, soonest first — separate from the
 * Debt Summary card's net-per-currency total, this is about which specific
 * payments need attention next, not the overall balance. Entries with no
 * due date are omitted entirely rather than sorted last; a card about
 * upcoming dates has nothing useful to say about a debt with none. */
export function PaymentsComingDueCard() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { openDebt, openDebtEntry } = useSheets();
  const [entries, setEntries] = useState<DebtEntry[] | null>(null);

  useEffect(() => {
    if (!token || !activeWorkspace) return;
    let alive = true;
    listDebtApi(token, activeWorkspace.id, undefined, false).then((list) => {
      if (!alive) return;
      const due = list
        .filter((e) => !!e.due_date)
        .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0))
        .slice(0, 5);
      setEntries(due);
    });
    return () => {
      alive = false;
    };
  }, [token, activeWorkspace]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <FeedCard title={t("debt_coming_due")} onPressTitle={openDebt}>
      {entries === null ? (
        <FeedMuted text={t("f_loading")} />
      ) : entries.length === 0 ? (
        <FeedMuted text={t("debt_coming_due_empty")} />
      ) : (
        <View style={{ gap: space.sm }}>
          {entries.map((e) => {
            const overdue = e.due_date! < today;
            return (
              <Pressable key={e.id} onPress={() => openDebtEntry(e.id)} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: space.sm }}>
                  <Text style={{ color: theme.text, fontSize: type.base, fontWeight: weight.semibold }} numberOfLines={1}>
                    {e.party_name}
                  </Text>
                  <Text style={{ color: overdue ? theme.danger : theme.muted, fontSize: type.sm }}>
                    {e.due_date}
                    {overdue ? ` · ${t("debt_overdue")}` : ""}
                  </Text>
                </View>
                <Text
                  style={{
                    color: e.direction === "they_owe_us" ? theme.accent : theme.danger,
                    fontSize: type.base,
                    fontWeight: weight.bold,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {e.amount.toLocaleString()} {e.currency}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </FeedCard>
  );
}
