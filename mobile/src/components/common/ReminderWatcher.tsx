import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useAppState } from "../../state/StateProvider";
import { iso, timeToMinutes } from "../../utils/date";
import {
  fireWebNotification,
  isNotificationsEnabled,
  webNotificationsGranted,
} from "../../services/notifications";
import { getQuietHours, inQuietHours } from "../../services/prefs";

// Web-only: native gets real OS notifications from expo-notifications. On the web
// the browser can't schedule OS alarms, so while the app is open we poll for
// reminders that just came due and raise a browser notification. Fires nothing on
// native, and nothing unless the user enabled alerts and granted permission.
export function ReminderWatcher() {
  const { events } = useAppState();
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS !== "web") return;

    const tick = async () => {
      if (!webNotificationsGranted()) return;
      if (!(await isNotificationsEnabled())) return;

      const now = Date.now();
      const nowD = new Date();
      const quiet = await getQuietHours();
      if (inQuietHours(`${String(nowD.getHours()).padStart(2, "0")}:${String(nowD.getMinutes()).padStart(2, "0")}`, quiet)) return;
      const today = iso(new Date());
      const jsDay = new Date().getDay();

      for (const e of events) {
        if (e.status === "done" || !e.time) continue;
        const mins = timeToMinutes(e.time);
        if (mins == null) continue;

        const occursToday = e.recur
          ? e.recur.days.includes(jsDay) && today >= e.recur.from && today <= e.recur.to
          : e.date === today;
        if (!occursToday) continue;

        const target = new Date();
        target.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
        const diff = now - target.getTime();
        const key = e.id + ":" + today;

        // fire once, within a minute of the due time
        if (diff >= 0 && diff < 60000 && !fired.current.has(key)) {
          fired.current.add(key);
          fireWebNotification("Reminder", e.title);
        }
      }
    };

    const id = setInterval(tick, 20000);
    tick();
    return () => clearInterval(id);
  }, [events]);

  return null;
}
