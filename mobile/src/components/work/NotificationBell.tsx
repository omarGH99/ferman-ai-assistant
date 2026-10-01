import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius } from "../../theme/tokens";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { Icon } from "../../ui/Icon";
import { listNotificationsApi } from "../../services/workspace";

const POLL_MS = 30000;

/** Polls the unread count while Work mode is on screen -- not push, just a
 * periodic re-fetch so the badge doesn't go stale for the length of a
 * session. Closing/backgrounding the app stops it (the effect's own
 * cleanup), matching the "in-app only" scope: nothing fires when the app
 * isn't open. */
export function NotificationBell() {
  const { theme } = useTheme();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { openNotifications } = useSheets();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!token || !activeWorkspace) return;
    let alive = true;
    function refresh() {
      listNotificationsApi(token!, activeWorkspace!.id, true, 1).then((res) => {
        if (alive) setUnread(res.unread_count);
      });
    }
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token, activeWorkspace]);

  return (
    <Pressable onPress={openNotifications} style={styles.wrap} hitSlop={8}>
      <Icon name="bell" size={20} color={theme.text} />
      {unread > 0 && (
        <View style={[styles.badge, { backgroundColor: theme.danger, borderColor: theme.bg }]}>
          <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 6 },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: radius.round,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 9, fontWeight: "700" },
});
