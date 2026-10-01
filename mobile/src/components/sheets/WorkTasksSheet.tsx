import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { useToast } from "../../ui/ToastProvider";
import { TaskStatus, WorkTask, fetchTasksCsv, listTasksApi, setTaskDoneApi } from "../../services/workspace";
import { saveOrShareCsv } from "../../utils/exportCsv";

const BOARD_STATUSES: TaskStatus[] = ["todo", "in_progress", "review", "done"];

/** "Mine" vs "All" rather than the wireframe's Mine/Assigned-to-me/Team three
 * chips — assigned-to-me and mine are the same filter from a solo tester's
 * seat, and a third chip that behaves identically to a second isn't worth
 * the row until a workspace has enough members for the difference to show. */
export function WorkTasksSheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token, user } = useAuth();
  const { activeWorkspace } = useWorkspace();
  const { activeSheet, closeSheet, openWorkTaskEntry, openNewWorkTask } = useSheets();
  const { showToast } = useToast();

  const visible = activeSheet === "workTasks";
  const [mineOnly, setMineOnly] = useState(false);
  const [view, setView] = useState<"list" | "board">("list");
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    if (!token || !activeWorkspace) return;
    setExporting(true);
    try {
      const csv = await fetchTasksCsv(token, activeWorkspace.id);
      await saveOrShareCsv(csv, `tasks_${activeWorkspace.id}.csv`);
    } catch (e: any) {
      showToast(e?.message || t("diwan_save_failed"));
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!visible || !token || !activeWorkspace) return;
    setLoading(true);
    listTasksApi(token, activeWorkspace.id, mineOnly ? user?.id : undefined)
      .then(setTasks)
      .finally(() => setLoading(false));
  }, [visible, token, activeWorkspace, mineOnly, user?.id]);

  async function onToggleDone(taskId: number, done: boolean) {
    if (!token || !activeWorkspace) return;
    const updated = await setTaskDoneApi(token, activeWorkspace.id, taskId, done);
    setTasks((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  }

  const q = query.trim().toLowerCase();
  const shownTasks = q ? tasks.filter((tsk) => tsk.title.toLowerCase().includes(q)) : tasks;

  if (!activeWorkspace) {
    return <BottomSheet visible={visible} onClose={closeSheet} />;
  }

  return (
    <BottomSheet visible={visible} onClose={closeSheet} title={t("tasks_title")}>
      <View style={styles.tabs}>
        {[false, true].map((mine) => {
          const on = mine === mineOnly;
          return (
            <Pressable
              key={String(mine)}
              onPress={() => setMineOnly(mine)}
              style={[
                styles.tab,
                { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.soft : theme.surface },
              ]}
            >
              <Text style={{ color: on ? theme.accent : theme.muted, fontWeight: on ? weight.bold : weight.regular, fontSize: type.sm }}>
                {t(mine ? "tasks_mine" : "tasks_all")}
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
        <Pressable style={[styles.newBtn, { backgroundColor: theme.accent }]} onPress={openNewWorkTask} hitSlop={8}>
          <Text style={{ color: theme.accentInk, fontWeight: weight.bold, fontSize: type.md }}>+</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {(["list", "board"] as const).map((v) => {
          const on = v === view;
          return (
            <Pressable
              key={v}
              onPress={() => setView(v)}
              style={[
                styles.tab,
                { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.soft : theme.surface },
              ]}
            >
              <Text style={{ color: on ? theme.accent : theme.muted, fontWeight: on ? weight.bold : weight.regular, fontSize: type.sm }}>
                {t(v === "list" ? "tasks_view_list" : "tasks_view_board")}
              </Text>
            </Pressable>
          );
        })}
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
      ) : shownTasks.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: type.base, marginTop: space.lg }}>{t("tasks_empty")}</Text>
      ) : view === "list" ? (
        shownTasks.map((task) => (
          <View key={task.id} style={[styles.row, { borderColor: theme.line }]}>
            <Pressable style={{ flex: 1 }} onPress={() => openWorkTaskEntry(task.id)}>
              <Text
                style={{
                  color: task.done ? theme.muted : theme.text,
                  textDecorationLine: task.done ? "line-through" : "none",
                  fontWeight: weight.semibold,
                  fontSize: type.base,
                }}
                numberOfLines={1}
              >
                {task.title}
              </Text>
              {!!task.due_date && (
                <Text style={{ color: theme.muted, fontSize: type.sm, marginTop: 2 }}>{task.due_date}</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => onToggleDone(task.id, !task.done)}
              style={[styles.cbx, { borderColor: theme.line, backgroundColor: task.done ? theme.accent : "transparent" }]}
              hitSlop={8}
            >
              {task.done ? <Text style={{ color: theme.accentInk, fontSize: type.sm }}>✓</Text> : null}
            </Pressable>
          </View>
        ))
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.board}>
          {BOARD_STATUSES.map((status) => {
            const inColumn = shownTasks.filter((tsk) => tsk.status === status);
            return (
              <View key={status} style={[styles.column, { borderColor: theme.line, backgroundColor: theme.surface }]}>
                <Text style={{ color: theme.muted, fontSize: type.xs, fontWeight: weight.semibold, marginBottom: space.sm }}>
                  {t(`tasks_status_${status}`).toUpperCase()} · {inColumn.length}
                </Text>
                {inColumn.map((task) => (
                  <Pressable
                    key={task.id}
                    onPress={() => openWorkTaskEntry(task.id)}
                    style={[styles.card, { borderColor: theme.line, backgroundColor: theme.bg }]}
                  >
                    <Text style={{ color: theme.text, fontSize: type.sm, fontWeight: weight.semibold }} numberOfLines={2}>
                      {task.title}
                    </Text>
                    {!!task.due_date && (
                      <Text style={{ color: theme.muted, fontSize: type.xs, marginTop: 2 }}>{task.due_date}</Text>
                    )}
                  </Pressable>
                ))}
              </View>
            );
          })}
        </ScrollView>
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
  cbx: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  search: { borderWidth: 1, borderRadius: radius.md, padding: space.sm, fontSize: type.sm, marginBottom: space.md },
  board: { marginHorizontal: -space.md },
  column: { width: 200, borderWidth: 1, borderRadius: radius.md, padding: space.sm, marginHorizontal: space.xs },
  card: { borderWidth: 1, borderRadius: radius.sm, padding: space.sm, marginBottom: space.sm },
});
