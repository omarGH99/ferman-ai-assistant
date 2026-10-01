import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EventItem } from "../state/types";
import { parseISO, timeToMinutes } from "../utils/date";
import { getQuietHours, inQuietHours } from "./prefs";

const PREF_KEY = "notifs";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function isNotificationsEnabled() {
  return (await AsyncStorage.getItem(PREF_KEY)) === "on";
}

export async function setNotificationsEnabled(on: boolean) {
  await AsyncStorage.setItem(PREF_KEY, on ? "on" : "off");
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") {
    // Browser Notification API: reminders fire while the app/tab is open. (Firing
    // when the tab is fully closed would need Web Push + a service worker.)
    try {
      if (typeof Notification === "undefined") return false;
      if (Notification.permission === "granted") return true;
      const res = await Notification.requestPermission();
      return res === "granted";
    } catch {
      return false;
    }
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: true },
  });
  return !!req.granted;
}

// --- web foreground notifications (used by ReminderWatcher) ---
export function webNotificationsGranted(): boolean {
  return (
    Platform.OS === "web" &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  );
}

export function fireWebNotification(title: string, body: string) {
  try {
    new Notification(title, { body });
  } catch {
    /* ignore */
  }
}

export async function cancelEventNotifications(event: EventItem) {
  if (!event.notifIds || !event.notifIds.length) return;
  await Promise.all(
    event.notifIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
}

// Schedules a real local notification for the event's time: a one-off DATE
// trigger for single-date events, or one repeating WEEKLY trigger per
// recurring weekday (expo-notifications only supports a single weekday per
// scheduled notification, so a "every Mon & Wed" event gets two).
export async function scheduleEventNotifications(event: EventItem): Promise<string[]> {
  await cancelEventNotifications(event);
  if (Platform.OS === "web") return [];
  if (event.status === "done") return [];
  if (!(await isNotificationsEnabled())) return [];

  const mins = timeToMinutes(event.time);
  if (mins == null) return [];
  const hour = Math.floor(mins / 60);
  const minute = mins % 60;

  // Quiet hours suppress the alert, not the reminder: the item still exists and
  // still shows in the app — it just doesn't buzz at 3am.
  const quiet = await getQuietHours();
  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (inQuietHours(hhmm, quiet)) return [];
  const ids: string[] = [];

  try {
    if (event.recur) {
      for (const jsDay of event.recur.days) {
        const weekday = jsDay + 1; // JS getDay(): 0=Sun..6=Sat -> Expo weekday: 1=Sun..7=Sat
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: "Reminder", body: event.title },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour,
            minute,
          },
        });
        ids.push(id);
      }
    } else if (event.date) {
      const d = parseISO(event.date);
      d.setHours(hour, minute, 0, 0);
      if (d.getTime() > Date.now()) {
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: "Reminder", body: event.title },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: d },
        });
        ids.push(id);
      }
    }
  } catch (e) {
    // Notification scheduling can fail in environments without full native
    // support (e.g. Expo Go on some SDKs) — degrade silently, same as the
    // web app's try/catch around Notification().
  }
  return ids;
}
