import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import {
  AppNotification, listNotificationsApi, markAllNotificationsReadApi, markNotificationReadApi,
} from "../../services/workspace";

/** Same per-kind template approach as RecentActivityCard's describe() --
 * translated label plus the raw title from detail, never a server-built
 * sentence. */
function describe(n: AppNotification, t: (k: string) => string): string {
  const d = n.detail || {};
  switch (n.kind) {
    case "task_assigned":
      return `${t("notif_task_assigned")}: ${d.title}`;
    case "task_commented":
      return `${t("notif_task_commented")}: ${d.title}`;
    case "approval_requested":
      return `${t("notif_approval_requested")}: ${d.title}`;
    case "approval_decided":
      return `${t(d.status === "approved" ? "act_approval_approved" : "act_approval_rejected")}: ${d.title}`;
    default:
      return n.kind;
  }
}

export function NotificationsSheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeSheet, closeSheet, openWorkTaskEntry, openApprovalEntry } = useSheets();

  const visible = activeSheet === "notifications";
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !token || !activeWorkspace) return;
    setLoading(true);
    listNotificationsApi(token, activeWorkspace.id)
      .then((res) => setNotifications(res.notifications))
      .finally(() => setLoading(false));
  }, [visible, token, activeWorkspace]);

  async function onOpen(n: AppNotification) {
    if (!token || !activeWorkspace) return;
    if (!n.read) {
      markNotificationReadApi(token, activeWorkspace.id, n.id).catch(() => {});
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    closeSheet();
    if (n.kind === "task_assigned" || n.kind === "task_commented") {
      if (n.detail.task_id) openWorkTaskEntry(n.detail.task_id);
    } else if (n.kind === "approval_requested" || n.kind === "approval_decided") {
      if (n.detail.request_id) openApprovalEntry(n.detail.request_id);
    }
  }

  async function onMarkAllRead() {
    if (!token || !activeWorkspace) return;
    await markAllNotificationsReadApi(token, activeWorkspace.id);
    setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
  }

  if (!activeWorkspace) {
    return <BottomSheet visible={visible} onClose={closeSheet} />;
  }

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <BottomSheet visible={visible} onClose={closeSheet} title={t("notif_title")}>
      {hasUnread && (
        <Pressable onPress={onMarkAllRead} style={{ alignSelf: "flex-end", marginBottom: space.sm }}>
          <Text style={{ color: theme.accent, fontSize: type.sm, fontWeight: weight.semibold }}>
            {t("notif_mark_all_read")}
          </Text>
        </Pressable>
      )}
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: space.xl }} />
      ) : notifications.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: type.base, marginTop: space.lg }}>{t("notif_empty")}</Text>
      ) : (
        notifications.map((n) => (
          <Pressable key={n.id} onPress={() => onOpen(n)} style={[styles.row, { borderColor: theme.line }]}>
            {!n.read && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: theme.text, fontSize: type.sm, fontWeight: n.read ? weight.regular : weight.semibold }}
                numberOfLines={2}
              >
                {describe(n, t)}
              </Text>
              <Text style={{ color: theme.muted, fontSize: type.xs, marginTop: 2 }}>
                {new Date(n.created_at).toLocaleString()}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: space.md, borderBottomWidth: 1, gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: radius.round, marginTop: 6 },
});
