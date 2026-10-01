import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { Icon } from "../../ui/Icon";
import { useI18n } from "../../i18n/I18nProvider";
import { useAppState } from "../../state/StateProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { useAuth } from "../../state/AuthProvider";

export function Header() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { events, shopping } = useAppState();
  const { openLists, openSettings } = useSheets();
  const { user } = useAuth();

  const badgeCount = events.filter((e) => e.status !== "done").length + shopping.length;

  const hr = new Date().getHours();
  const part = hr < 12 ? "morning" : hr < 18 ? "afternoon" : "evening";
  const base = t("greet_" + part);
  const displayName = user ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : "";
  const greeting = displayName ? `${base}, ${displayName}` : base;

  return (
    <View style={[styles.header, { backgroundColor: theme.header, borderBottomColor: theme.line }]}>
      <View style={styles.brand}>
        <Text style={[styles.wordmark, { color: theme.accent }]}>Ferman</Text>
        <Text style={[styles.greet, { color: theme.muted }]} numberOfLines={1}>
          {greeting}
        </Text>
      </View>
      <View style={styles.actions}>
        {/* Wrapped, not passed directly: onPress hands the handler a touch event,
            which openLists would otherwise take as the tab to select. */}
        <Pressable style={[styles.icoBtn, { backgroundColor: theme.chip }]} onPress={() => openLists()}>
          <Icon name="tasks" size={17} color={theme.text} />
          {badgeCount > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
              <Text style={[styles.badgeText, { color: theme.accentInk }]}>{badgeCount}</Text>
            </View>
          )}
        </Pressable>
        <Pressable style={[styles.icoBtn, { backgroundColor: theme.chip }]} onPress={openSettings}>
          <Text style={{ fontSize: 15 }}>⚙️</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  brand: { flexDirection: "column", justifyContent: "center", flexShrink: 1 },
  wordmark: { fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
  greet: { fontSize: 12, fontWeight: "600", flexShrink: 1, marginTop: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: 6 },
  icoBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
