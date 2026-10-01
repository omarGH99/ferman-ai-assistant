import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { FeedCard, FeedMuted } from "../feed/FeedCard";
import { space, type, weight } from "../../theme/tokens";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { WorkTask, listTasksApi } from "../../services/workspace";

/** Shows what's assigned to the signed-in user specifically — "my open
 * tasks" is the useful glance from the feed; the full roster is what the
 * sheet is for. */
export function WorkTasksSummaryCard() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { openWorkTasks, openWorkTaskEntry } = useSheets();
  const [tasks, setTasks] = useState<WorkTask[] | null>(null);

  useEffect(() => {
    if (!token || !activeWorkspace || !user) return;
    let alive = true;
    listTasksApi(token, activeWorkspace.id, user.id, false).then((list) => {
      if (alive) setTasks(list.slice(0, 3));
    });
    return () => {
      alive = false;
    };
  }, [token, activeWorkspace, user]);

  return (
    <FeedCard title={t("tasks_title")} onPressTitle={openWorkTasks}>
      {tasks === null ? (
        <FeedMuted text={t("f_loading")} />
      ) : tasks.length === 0 ? (
        <FeedMuted text={t("tasks_empty")} />
      ) : (
        <View style={{ gap: space.sm }}>
          {tasks.map((task) => (
            <Pressable key={task.id} onPress={() => openWorkTaskEntry(task.id)}>
              <Text style={{ color: theme.text, fontSize: type.base, fontWeight: weight.semibold }} numberOfLines={1}>
                {task.title}
              </Text>
              <Text style={{ color: theme.muted, fontSize: type.sm }}>
                {t(`tasks_status_${task.status}`)}
                {!!task.due_date && `  ·  ${task.due_date}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </FeedCard>
  );
}
