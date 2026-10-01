import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { radius, space, type, weight } from "../theme/tokens";
import { useI18n } from "../i18n/I18nProvider";
import { useWidgetPrefs } from "../state/WidgetPrefsProvider";
import type { WidgetKey } from "../state/WidgetPrefsProvider";
import type { WidgetSlot } from "../state/types";
import { WIDGET_COMPONENTS } from "../components/feed/registry";
import { useWorkspace } from "../state/WorkspaceProvider";
import { DiwanSummaryCard } from "../components/work/DiwanSummaryCard";
import { DebtSummaryCard } from "../components/work/DebtSummaryCard";
import { WorkTasksSummaryCard } from "../components/work/WorkTasksSummaryCard";
import { ApprovalsSummaryCard } from "../components/work/ApprovalsSummaryCard";
import { PaymentsComingDueCard } from "../components/work/PaymentsComingDueCard";
import { RecentActivityCard } from "../components/work/RecentActivityCard";
import { NotificationBell } from "../components/work/NotificationBell";
import { useSheets } from "../ui/SheetsProvider";
import { Icon } from "../ui/Icon";

/** Group the enabled widgets into rows: two consecutive half-width widgets share
 * a row, everything else gets its own.
 *
 * A half-width widget with no half-width neighbour is rendered full width
 * instead of leaving a gap — the same rule the hardcoded weather/air pairing
 * used, now applied to any pair the user arranges.
 */
function toRows(layout: WidgetSlot[]): WidgetSlot[][] {
  const on = layout.filter((w) => w.on);
  const rows: WidgetSlot[][] = [];
  for (let i = 0; i < on.length; ) {
    const a = on[i];
    const b = on[i + 1];
    if (a.width === "half" && b && b.width === "half") {
      rows.push([a, b]);
      i += 2;
    } else {
      rows.push([a]);
      i += 1;
    }
  }
  return rows;
}

/** Not shown to Hamo/dara yet — Work mode exists in the codebase so it can be
 * built and tested, but nothing about reaching it is announced anywhere, and
 * it stays inert until this build is deployed. */
function ModeToggle() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { mode, setMode } = useWorkspace();
  return (
    <View style={[styles.toggle, { borderColor: theme.line }]}>
      {(["personal", "work"] as const).map((m) => {
        const on = m === mode;
        return (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.toggleBtn, { backgroundColor: on ? theme.chip : "transparent" }]}>
            <Text style={{ color: on ? theme.text : theme.muted, fontWeight: on ? weight.bold : weight.regular, fontSize: type.sm }}>
              {t(m === "personal" ? "mode_personal" : "mode_work")}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Shows the active workspace's name and opens the switcher — the only place
 * that name appears anywhere in Work mode otherwise, so without this button
 * there was no way to tell which workspace you were looking at, let alone
 * switch to another one someone belongs to. Only rendered once a workspace
 * exists; the empty state has its own create/join flow. */
function WorkspaceButton() {
  const { theme } = useTheme();
  const { chromeRtl } = useI18n();
  const { activeWorkspace } = useWorkspace();
  const { openWorkspaceSwitcher } = useSheets();
  if (!activeWorkspace) return null;
  return (
    <Pressable onPress={openWorkspaceSwitcher} style={[styles.wsButton, { borderColor: theme.line }]}>
      <Text style={{ color: theme.text, fontSize: type.sm, fontWeight: weight.semibold }} numberOfLines={1}>
        {activeWorkspace.name}
      </Text>
      <Icon name="chevron" size={12} color={theme.muted} flip={chromeRtl} />
    </Pressable>
  );
}

/** Create-or-join, inline rather than a separate sheet — it's one text field
 * either way, and the empty state is the only place this is ever shown. */
function WorkspaceEmptyState() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { createWorkspace, joinWorkspace } = useWorkspace();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await createWorkspace(name.trim());
    } catch (e: any) {
      setErr(e?.message || t("ws_error"));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    if (!code.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await joinWorkspace(code.trim());
    } catch (e: any) {
      setErr(e?.message || t("ws_bad_code"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.empty}>
      <Text style={{ color: theme.muted, fontSize: type.base, textAlign: "center", marginBottom: space.lg }}>
        {t("ws_none")}
      </Text>
      {!showCreate && !showJoin && (
        <View style={styles.emptyBtns}>
          <Pressable style={[styles.wsBtn, { backgroundColor: theme.accent }]} onPress={() => setShowCreate(true)}>
            <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("ws_create")}</Text>
          </Pressable>
          <Pressable style={[styles.wsBtn, { borderWidth: 1, borderColor: theme.line }]} onPress={() => setShowJoin(true)}>
            <Text style={{ color: theme.text, fontWeight: weight.bold }}>{t("ws_join")}</Text>
          </Pressable>
        </View>
      )}
      {showCreate && (
        <View style={styles.emptyBtns}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("ws_name_label")}
            placeholderTextColor={theme.muted}
            style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          />
          <Pressable style={[styles.wsBtn, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={onCreate}>
            {busy ? <ActivityIndicator color={theme.accentInk} /> : <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("ws_create")}</Text>}
          </Pressable>
        </View>
      )}
      {showJoin && (
        <View style={styles.emptyBtns}>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder={t("ws_code_label")}
            placeholderTextColor={theme.muted}
            autoCapitalize="characters"
            style={[styles.input, { borderColor: theme.line, color: theme.text, textAlign: "center", letterSpacing: 3, fontWeight: weight.bold }]}
          />
          <Pressable style={[styles.wsBtn, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={onJoin}>
            {busy ? <ActivityIndicator color={theme.accentInk} /> : <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("ws_join")}</Text>}
          </Pressable>
        </View>
      )}
      {!!err && <Text style={{ color: theme.danger, fontSize: type.sm, marginTop: space.sm }}>{err}</Text>}
    </View>
  );
}

export function TodayScreen() {
  const { theme } = useTheme();
  const { layout } = useWidgetPrefs();
  const insets = useSafeAreaInsets();
  const { mode, activeWorkspace, loading } = useWorkspace();

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}
    >
      <View style={styles.headerRow}>
        <ModeToggle />
        {mode === "work" && activeWorkspace && (
          <View style={styles.workHeaderRight}>
            <WorkspaceButton />
            <NotificationBell />
          </View>
        )}
      </View>
      {mode === "personal" ? (
        toRows(layout).map((row) => {
          if (row.length === 2) {
            const [A, B] = row.map((w) => WIDGET_COMPONENTS[w.key as WidgetKey]);
            return (
              <View key={row[0].key} style={styles.pair}>
                <A half />
                <B half />
              </View>
            );
          }
          const Card = WIDGET_COMPONENTS[row[0].key as WidgetKey];
          return Card ? <Card key={row[0].key} /> : null;
        })
      ) : loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: space.xxl }} />
      ) : !activeWorkspace ? (
        <WorkspaceEmptyState />
      ) : (
        <>
          <ApprovalsSummaryCard />
          <DiwanSummaryCard />
          <DebtSummaryCard />
          <PaymentsComingDueCard />
          <WorkTasksSummaryCard />
          <RecentActivityCard />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: space.md },
  // The row owns the horizontal spacing; the half cards drop their own.
  pair: {
    flexDirection: "row",
    gap: space.md,
    marginHorizontal: space.md,
    marginBottom: space.md,
    alignItems: "stretch",
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  workHeaderRight: { flexDirection: "row", alignItems: "center", gap: space.sm, marginEnd: space.md, marginBottom: space.md },
  wsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.round,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    maxWidth: 160,
  },
  toggle: {
    flexDirection: "row",
    marginHorizontal: space.md,
    marginBottom: space.md,
    borderRadius: radius.round,
    borderWidth: 1,
    padding: 3,
    alignSelf: "flex-start",
  },
  toggleBtn: { paddingVertical: space.xs, paddingHorizontal: space.lg, borderRadius: radius.round },
  empty: { alignItems: "center", paddingHorizontal: space.lg, paddingTop: space.xxl },
  emptyBtns: { gap: space.sm, width: "100%", maxWidth: 320 },
  wsBtn: { borderRadius: radius.md, paddingVertical: space.md, alignItems: "center" },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, fontSize: type.md },
});
