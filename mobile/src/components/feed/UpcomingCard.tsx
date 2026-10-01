import React from "react";
import { FeedCard, FeedMuted } from "./FeedCard";
import { FeedRow } from "./FeedRow";
import { useI18n } from "../../i18n/I18nProvider";
import { isRtlText } from "../../i18n/I18nProvider";
import { useAppState } from "../../state/StateProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { eventsOnDate } from "../../utils/date";
import { EventItem } from "../../state/types";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function UpcomingCard({ half }: { half?: boolean } = {}) {
  const { t } = useI18n();
  const st = useAppState();
  const { openEvent, openLists } = useSheets();

  const out: { e: EventItem; dt: Date }[] = [];
  for (let i = 1; i <= 7; i++) {
    const dt = new Date();
    dt.setDate(dt.getDate() + i);
    eventsOnDate(st.events, dt)
      .filter((e) => e.status !== "done")
      .forEach((e) => out.push({ e, dt: new Date(dt) }));
  }
  const rows = out.slice(0, 6);

  return (
    <FeedCard half={half} title={t("f_upcoming")} icon="upcoming" onPressTitle={() => openLists("reminders")}>
      {!rows.length ? (
        <FeedMuted text={t("e_upcoming")} />
      ) : (
        rows.map(({ e, dt }, i) => (
          <FeedRow
            key={e.id + i}
            first={i === 0}
            time={WD[dt.getDay()] + (e.time ? " " + e.time : "")}
            text={e.title}
            rtl={isRtlText(e.title)}
            onPress={() => openEvent(e.id)}
          />
        ))
      )}
    </FeedCard>
  );
}
