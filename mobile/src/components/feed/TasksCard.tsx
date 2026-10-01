import React from "react";
import { Pressable, Text } from "react-native";
import { FeedCard, FeedMuted } from "./FeedCard";
import { FeedRow } from "./FeedRow";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { isRtlText } from "../../i18n/I18nProvider";
import { useAppState } from "../../state/StateProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { eventsOnDate, todayISO } from "../../utils/date";

export function TasksCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const st = useAppState();
  const { openEvent, openLists } = useSheets();

  const today = todayISO();
  const due = eventsOnDate(st.events, new Date()).filter((e) => e.status !== "done");

  // Anything dated before today and still unfinished used to appear nowhere:
  // this card only looked at today, and Upcoming starts at tomorrow. An overdue
  // task simply vanished from the feed until you opened the lists sheet.
  // Recurring items have no fixed date, so they can't be overdue.
  const overdue = st.events
    .filter((e) => e.status !== "done" && !e.recur && e.date && e.date < today)
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));

  const total = overdue.length + due.length;

  const row = (e: (typeof due)[number], first: boolean, late: boolean) => (
    <FeedRow
      key={e.id}
      first={first}
      time={late ? e.date!.slice(5).replace("-", "/") : e.time || "·"}
      text={e.title}
      rtl={isRtlText(e.title)}
      highlighted={late}
      onPress={() => openEvent(e.id)}
      right={
        <Pressable
          style={{ backgroundColor: theme.soft, width: 24, height: 24, borderRadius: 8, alignItems: "center", justifyContent: "center" }}
          onPress={() => st.setEventStatus(e.id, "done")}
          hitSlop={12}
        >
          <Text style={{ color: theme.accent, fontSize: 12 }}>✓</Text>
        </Pressable>
      }
    />
  );

  return (
    <FeedCard half={half}
      title={t("f_today_tasks")} icon="tasks"
      onPressTitle={() => openLists("tasks")}
      right={
        total ? (
          <Text style={{ color: overdue.length ? theme.danger : theme.muted, fontSize: 11 }}>
            {overdue.length ? `${overdue.length} ${t("overdue")} · ${total}` : total}
          </Text>
        ) : null
      }
    >
      {!total ? (
        <FeedMuted text={t("no_tasks_today")} />
      ) : (
        <>
          {overdue.map((e, i) => row(e, i === 0, true))}
          {due.map((e, i) => row(e, i === 0 && !overdue.length, false))}
        </>
      )}
    </FeedCard>
  );
}
