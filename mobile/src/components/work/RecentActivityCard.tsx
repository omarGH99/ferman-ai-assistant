import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { FeedCard, FeedMuted } from "../feed/FeedCard";
import { space, type } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { ActivityEntry, listActivityApi } from "../../services/workspace";

/** Renders each entry from a translated template keyed by `kind` plus the
 * structured `detail` the backend stored, rather than trusting any
 * server-built sentence -- see workspace.py's log_activity for why the row
 * itself only ever carries (kind, detail), never English text. */
function describe(a: ActivityEntry, t: (k: string) => string): string {
  const d = a.detail || {};
  switch (a.kind) {
    case "diwan_created":
      return `${t("act_diwan_created")}: #${d.serial_number} — ${d.entity_name}`;
    case "diwan_replied":
      return `${t("act_diwan_replied")}: #${d.serial_number} — ${d.entity_name}`;
    case "debt_created":
      return `${t("act_debt_created")}: ${d.party_name} (${Number(d.amount).toLocaleString()} ${d.currency})`;
    case "debt_settled":
      return `${t("act_debt_settled")}: ${d.party_name} (${Number(d.amount).toLocaleString()} ${d.currency})`;
    case "task_created":
      return `${t("act_task_created")}: ${d.title}`;
    case "task_completed":
      return `${t("act_task_completed")}: ${d.title}`;
    case "task_commented":
      return `${t("act_task_commented")}: ${d.title}`;
    case "approval_created":
      return `${t("act_approval_created")}: ${d.title}`;
    case "approval_decided":
      return `${t(d.status === "approved" ? "act_approval_approved" : "act_approval_rejected")}: ${d.title}`;
    case "approval_cancelled":
      return `${t("act_approval_cancelled")}: ${d.title}`;
    default:
      return a.kind;
  }
}

export function RecentActivityCard() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);

  useEffect(() => {
    if (!token || !activeWorkspace) return;
    let alive = true;
    listActivityApi(token, activeWorkspace.id, 6).then((list) => {
      if (alive) setActivity(list);
    });
    return () => {
      alive = false;
    };
  }, [token, activeWorkspace]);

  return (
    <FeedCard title={t("act_title")}>
      {activity === null ? (
        <FeedMuted text={t("f_loading")} />
      ) : activity.length === 0 ? (
        <FeedMuted text={t("act_empty")} />
      ) : (
        <View style={{ gap: space.sm }}>
          {activity.map((a) => (
            <View key={a.id}>
              <Text style={{ color: theme.text, fontSize: type.sm }} numberOfLines={1}>
                {describe(a, t)}
              </Text>
              <Text style={{ color: theme.muted, fontSize: type.xs }}>
                {new Date(a.created_at).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </FeedCard>
  );
}
