import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { useToast } from "../../ui/ToastProvider";
import { DebtDirection, DebtEntry, fetchDebtCsv, listDebtApi } from "../../services/workspace";
import { saveOrShareCsv } from "../../utils/exportCsv";

/** Amount stays in whichever currency was actually promised — USD and IQD
 * entries are never summed into one converted total, so this renders as two
 * separate figures rather than one number. */
export function DebtSheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeSheet, closeSheet, openDebtEntry, openNewDebtEntry } = useSheets();
  const { showToast } = useToast();

  const visible = activeSheet === "debt";
  const [direction, setDirection] = useState<DebtDirection>("they_owe_us");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<DebtEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    if (!token || !activeWorkspace) return;
    setExporting(true);
    try {
      const csv = await fetchDebtCsv(token, activeWorkspace.id);
      await saveOrShareCsv(csv, `debt_${activeWorkspace.id}.csv`);
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!visible || !token || !activeWorkspace) return;
    setLoading(true);
    listDebtApi(token, activeWorkspace.id, direction, false)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [visible, token, activeWorkspace, direction]);

  const q = query.trim().toLowerCase();
  const shown = q ? entries.filter((e) => e.party_name.toLowerCase().includes(q)) : entries;

  if (!activeWorkspace) {
    return <BottomSheet visible={visible} onClose={closeSheet} />;
  }

  return (
    <BottomSheet visible={visible} onClose={closeSheet} title={t("debt_title")}>
      <View style={styles.tabs}>
        {(["they_owe_us", "we_owe_them"] as DebtDirection[]).map((d) => {
          const on = d === direction;
          return (
            <Pressable
              key={d}
              onPress={() => setDirection(d)}
              style={[
                styles.tab,
                { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.soft : theme.surface },
              ]}
            >
              <Text
                style={{
                  color: on ? theme.accent : theme.muted,
                  fontWeight: on ? weight.bold : weight.regular,
                  fontSize: type.sm,
                }}
              >
                {t(d === "they_owe_us" ? "debt_they_owe" : "debt_we_owe")}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.exportBtn, { borderColor: theme.line, opacity: exporting ? 0.6 : 1, marginLeft: "auto" }]}
          onPress={onExport}
          disabled={exporting}
          hitSlop={8}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <Text style={{ color: theme.text, fontSize: type.xs, fontWeight: weight.semibold }}>
              {t("export_csv")}
            </Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.newBtn, { backgroundColor: theme.accent }]}
          onPress={() => openNewDebtEntry(direction)}
          hitSlop={8}
        >
          <Text style={{ color: theme.accentInk, fontWeight: weight.bold, fontSize: type.md }}>+</Text>
        </Pressable>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        style={[styles.search, { borderColor: theme.line, color: theme.text }]}
        placeholder={t("search_placeholder")}
        placeholderTextColor={theme.muted}
      />

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: space.xl }} />
      ) : shown.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: type.base, marginTop: space.lg }}>{t("debt_empty")}</Text>
      ) : (
        shown.map((e) => (
          <Pressable key={e.id} onPress={() => openDebtEntry(e.id)} style={[styles.row, { borderColor: theme.line }]}>
            <Text style={{ flex: 1, color: theme.text, fontWeight: weight.semibold, fontSize: type.base }} numberOfLines={1}>
              {e.party_name}
            </Text>
            <Text style={{ color: theme.accent, fontWeight: weight.bold, fontSize: type.base, fontVariant: ["tabular-nums"] }}>
              {e.amount.toLocaleString()} {e.currency}
            </Text>
          </Pressable>
        ))
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: space.sm, marginBottom: space.md, alignItems: "center" },
  tab: { paddingVertical: space.sm, paddingHorizontal: space.lg, borderRadius: radius.round, borderWidth: 1 },
  newBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.round,
    alignItems: "center",
    justifyContent: "center",
  },
  exportBtn: {
    borderWidth: 1,
    borderRadius: radius.round,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, borderBottomWidth: 1, gap: space.sm },
  search: { borderWidth: 1, borderRadius: radius.md, padding: space.sm, fontSize: type.sm, marginBottom: space.md },
});
