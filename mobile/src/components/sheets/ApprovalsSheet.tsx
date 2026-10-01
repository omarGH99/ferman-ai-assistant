import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { ApprovalRequest, listApprovalsApi } from "../../services/workspace";

export function ApprovalsSheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeSheet, closeSheet, openApprovalEntry, openNewApproval } = useSheets();

  const visible = activeSheet === "approvals";
  const [pendingOnly, setPendingOnly] = useState(true);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !token || !activeWorkspace) return;
    setLoading(true);
    listApprovalsApi(token, activeWorkspace.id, pendingOnly ? "pending" : undefined)
      .then(setRequests)
      .finally(() => setLoading(false));
  }, [visible, token, activeWorkspace, pendingOnly]);

  if (!activeWorkspace) {
    return <BottomSheet visible={visible} onClose={closeSheet} />;
  }

  return (
    <BottomSheet visible={visible} onClose={closeSheet} title={t("appr_title")}>
      <View style={styles.tabs}>
        {[true, false].map((pending) => {
          const on = pending === pendingOnly;
          return (
            <Pressable
              key={String(pending)}
              onPress={() => setPendingOnly(pending)}
              style={[
                styles.tab,
                { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.soft : theme.surface },
              ]}
            >
              <Text style={{ color: on ? theme.accent : theme.muted, fontWeight: on ? weight.bold : weight.regular, fontSize: type.sm }}>
                {t(pending ? "appr_pending" : "appr_decided")}
              </Text>
            </Pressable>
          );
        })}
        <Pressable style={[styles.newBtn, { backgroundColor: theme.accent }]} onPress={openNewApproval} hitSlop={8}>
          <Text style={{ color: theme.accentInk, fontWeight: weight.bold, fontSize: type.md }}>+</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: space.xl }} />
      ) : requests.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: type.base, marginTop: space.lg }}>{t("appr_empty")}</Text>
      ) : (
        requests.map((r) => {
          const statusColor =
            r.status === "approved" ? theme.accent : r.status === "rejected" ? theme.danger : theme.muted;
          return (
            <Pressable key={r.id} onPress={() => openApprovalEntry(r.id)} style={[styles.row, { borderColor: theme.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: weight.semibold, fontSize: type.base }} numberOfLines={1}>
                  {r.title}
                </Text>
                {r.amount != null && (
                  <Text style={{ color: theme.muted, fontSize: type.sm, marginTop: 2 }}>
                    {r.amount.toLocaleString()} {r.currency}
                  </Text>
                )}
              </View>
              <Text style={{ color: statusColor, fontSize: type.xs, fontWeight: weight.bold }}>
                {t(`appr_status_${r.status}`)}
              </Text>
            </Pressable>
          );
        })
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
    marginLeft: "auto",
  },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: space.md, borderBottomWidth: 1, gap: space.sm },
});
