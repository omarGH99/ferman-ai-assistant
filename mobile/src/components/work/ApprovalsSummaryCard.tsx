import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FeedCard, FeedMuted } from "../feed/FeedCard";
import { space, type, weight } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { ApprovalRequest, listApprovalsApi } from "../../services/workspace";

/** Only what's waiting on the signed-in user to decide — that's the thing a
 * feed glance is for. Requests they made themselves surface inside the full
 * sheet, not here. */
export function ApprovalsSummaryCard() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { openApprovals, openApprovalEntry } = useSheets();
  const [requests, setRequests] = useState<ApprovalRequest[] | null>(null);

  useEffect(() => {
    if (!token || !activeWorkspace || !user) return;
    let alive = true;
    listApprovalsApi(token, activeWorkspace.id, "pending", user.id).then((list) => {
      if (alive) setRequests(list);
    });
    return () => {
      alive = false;
    };
  }, [token, activeWorkspace, user]);

  return (
    <FeedCard
      title={t("appr_title")}
      onPressTitle={openApprovals}
      right={requests && requests.length > 0 ? <Text style={{ color: theme.accent, fontWeight: weight.bold, fontSize: type.sm }}>{requests.length}</Text> : undefined}
    >
      {requests === null ? (
        <FeedMuted text={t("f_loading")} />
      ) : requests.length === 0 ? (
        <FeedMuted text={t("appr_empty")} />
      ) : (
        <View style={{ gap: space.sm }}>
          {requests.map((r) => (
            <Pressable key={r.id} onPress={() => openApprovalEntry(r.id)}>
              <Text style={{ color: theme.text, fontSize: type.base, fontWeight: weight.semibold }} numberOfLines={1}>
                {r.title}
              </Text>
              {r.amount != null && (
                <Text style={{ color: theme.muted, fontSize: type.sm }}>
                  {r.amount.toLocaleString()} {r.currency}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </FeedCard>
  );
}
