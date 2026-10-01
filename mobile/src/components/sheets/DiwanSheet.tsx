import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { useToast } from "../../ui/ToastProvider";
import { DiwanDirection, DiwanEntry, fetchDiwanCsv, listDiwanApi } from "../../services/workspace";
import { saveOrShareCsv } from "../../utils/exportCsv";

/** The Diwan register: incoming/outgoing correspondence, filtered by the
 * free-text department each entry was logged under. */
export function DiwanSheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeSheet, closeSheet, openDiwanEntry, openNewDiwanEntry } = useSheets();
  const { showToast } = useToast();

  const visible = activeSheet === "diwan";
  const [direction, setDirection] = useState<DiwanDirection>("incoming");
  const [department, setDepartment] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<DiwanEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    if (!token || !activeWorkspace) return;
    setExporting(true);
    try {
      const csv = await fetchDiwanCsv(token, activeWorkspace.id);
      await saveOrShareCsv(csv, `diwan_${activeWorkspace.id}.csv`);
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!visible || !token || !activeWorkspace) return;
    setLoading(true);
    listDiwanApi(token, activeWorkspace.id, direction)
      .then(setEntries)
      .finally(() => setLoading(false));
  }, [visible, token, activeWorkspace, direction]);

  const departments = useMemo(
    () => Array.from(new Set(entries.map((e) => e.department).filter(Boolean))) as string[],
    [entries]
  );
  const byDept = department ? entries.filter((e) => e.department === department) : entries;
  const q = query.trim().toLowerCase();
  const shown = q ? byDept.filter((e) => e.entity_name.toLowerCase().includes(q)) : byDept;

  if (!activeWorkspace) {
    return <BottomSheet visible={visible} onClose={closeSheet} />;
  }

  return (
    <BottomSheet visible={visible} onClose={closeSheet} title={t("diwan_title")}>
      <View style={styles.tabs}>
        {(["incoming", "outgoing"] as DiwanDirection[]).map((d) => {
          const on = d === direction;
          return (
            <Pressable
              key={d}
              onPress={() => {
                setDirection(d);
                setDepartment(null);
              }}
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
                {t(d === "incoming" ? "diwan_incoming" : "diwan_outgoing")}
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
          onPress={() => openNewDiwanEntry(direction)}
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

      {departments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <Pressable
            onPress={() => setDepartment(null)}
            style={[styles.chip, { borderColor: !department ? theme.accent : theme.line }]}
          >
            <Text style={{ fontSize: type.xs, color: !department ? theme.accent : theme.muted }}>
              {t("diwan_all")}
            </Text>
          </Pressable>
          {departments.map((d) => (
            <Pressable
              key={d}
              onPress={() => setDepartment(d)}
              style={[styles.chip, { borderColor: department === d ? theme.accent : theme.line }]}
            >
              <Text style={{ fontSize: type.xs, color: department === d ? theme.accent : theme.muted }}>{d}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: space.xl }} />
      ) : shown.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: type.base, marginTop: space.lg }}>{t("diwan_empty")}</Text>
      ) : (
        shown.map((e) => (
          <Pressable key={e.id} onPress={() => openDiwanEntry(e.id)} style={[styles.row, { borderColor: theme.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: weight.semibold, fontSize: type.base }} numberOfLines={1}>
                #{e.serial_number} — {e.entity_name}
              </Text>
              {!!e.subject && (
                <Text style={{ color: theme.muted, fontSize: type.sm, marginTop: 2 }} numberOfLines={1}>
                  {e.subject}
                </Text>
              )}
            </View>
            {e.replied && (
              <View style={[styles.badge, { borderColor: theme.line }]}>
                <Text style={{ color: theme.muted, fontSize: type.xs }}>{t("diwan_replied")}</Text>
              </View>
            )}
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
  search: { borderWidth: 1, borderRadius: radius.md, padding: space.sm, fontSize: type.sm, marginBottom: space.md },
  chipRow: { marginBottom: space.md },
  chip: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radius.round, borderWidth: 1, marginRight: space.sm },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, borderBottomWidth: 1, gap: space.sm },
  badge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.sm, borderWidth: 1 },
});
