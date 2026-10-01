import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthProvider";
import { useAppState } from "./StateProvider";
import type { WidgetSlot, WidgetWidth } from "./types";
import type { IconName } from "../ui/Icon";

export const ALL_WIDGETS = [
  "weather",
  "forecast",
  "air",
  "tasks",
  "upcoming",
  "shopping",
  "water",
  "prayer",
  "holidays",
  "currency",
  "crypto",
  "news",
  "trending",
  "history",
] as const;
export type WidgetKey = (typeof ALL_WIDGETS)[number];

// Label (reuses the emoji-prefixed feed titles) + a one-line description for the
// onboarding picker. Both screens read from this single catalog.
// One entry per widget, read by the feed, onboarding and settings alike, so a
// widget can never show one icon in one place and another somewhere else.
export const WIDGET_META: Record<WidgetKey, { labelKey: string; descKey: string; icon: IconName }> = {
  weather: { labelKey: "f_weather", descKey: "od_weather", icon: "weather" },
  forecast: { labelKey: "f_forecast", descKey: "od_forecast", icon: "forecast" },
  air: { labelKey: "f_air", descKey: "od_air", icon: "air" },
  tasks: { labelKey: "f_today_tasks", descKey: "od_tasks", icon: "tasks" },
  upcoming: { labelKey: "f_upcoming", descKey: "od_upcoming", icon: "upcoming" },
  shopping: { labelKey: "f_shopping", descKey: "od_shopping", icon: "shopping" },
  water: { labelKey: "f_water", descKey: "od_water", icon: "water" },
  prayer: { labelKey: "f_prayer", descKey: "od_prayer", icon: "prayer" },
  holidays: { labelKey: "f_holidays", descKey: "od_holidays", icon: "holidays" },
  currency: { labelKey: "f_currency", descKey: "od_currency", icon: "currency" },
  crypto: { labelKey: "f_crypto", descKey: "od_crypto", icon: "crypto" },
  news: { labelKey: "f_news", descKey: "od_news", icon: "news" },
  trending: { labelKey: "f_trending", descKey: "od_trending", icon: "trending" },
  history: { labelKey: "f_history", descKey: "od_history", icon: "history" },
};

// Pre-checked in onboarding, and the fallback for any widget a user's stored
// prefs don't mention — which is how an account created before a widget existed
// picks it up.
//
// air/water/holidays were opt-in when they shipped, which meant nobody saw them:
// weather and air quality never paired, and testers couldn't give feedback on
// features they didn't know were there. They cost one API call each (holidays is
// cached server-side for a day) and can still be switched off.
export const DEFAULT_ON: WidgetKey[] = [
  "weather", "air", "tasks", "upcoming", "water", "holidays",
];

const PREFIX = "widgets_v2";
const keyFor = (userId: number | null | undefined) => (userId ? `${PREFIX}:${userId}` : PREFIX);

// Widgets that read well beside another. Everything else starts full width; the
// user can set any widget either way.
const DEFAULT_HALF: WidgetKey[] = ["weather", "air"];

function defaultLayout(): WidgetSlot[] {
  return ALL_WIDGETS.map((key) => ({
    key,
    on: DEFAULT_ON.includes(key),
    width: DEFAULT_HALF.includes(key) ? "half" : "full",
  }));
}

/** Build a valid, complete layout from whatever we were handed.
 *
 * Drops unknown keys and duplicates, then appends any widget the stored layout
 * never mentioned — switched off, so shipping a new widget never rearranges a
 * feed someone has already arranged. */
function completeLayout(slots: WidgetSlot[]): WidgetSlot[] {
  const seen = new Set<string>();
  const out: WidgetSlot[] = [];
  for (const slot of slots) {
    if (!ALL_WIDGETS.includes(slot.key as WidgetKey) || seen.has(slot.key)) continue;
    seen.add(slot.key);
    out.push(slot);
  }
  for (const key of ALL_WIDGETS) {
    if (seen.has(key)) continue;
    out.push({ key, on: false, width: DEFAULT_HALF.includes(key) ? "half" : "full" });
  }
  return out;
}

/** The pre-ordering format: `{ onboarded, prefs: Record<key, boolean> }` in
 * AsyncStorage, with the order hardcoded in TodayScreen. Read once and carried
 * across in that same order so nobody's setup resets on update. */
async function migrateFromAsyncStorage(
  userId: number | null
): Promise<{ layout: WidgetSlot[]; onboarded: boolean } | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const prefs = parsed?.prefs;
    if (!prefs || typeof prefs !== "object") return null;
    return {
      onboarded: !!parsed.onboarded,
      layout: ALL_WIDGETS.map((key) => ({
        key,
        on: key in prefs ? !!prefs[key] : DEFAULT_ON.includes(key),
        width: (DEFAULT_HALF.includes(key) ? "half" : "full") as WidgetWidth,
      })),
    };
  } catch {
    return null;
  }
}

interface WidgetPrefsContextValue {
  ready: boolean;
  onboarded: boolean;
  /** The feed, in order. Includes switched-off widgets so the editor can list
   * everything in one place. */
  layout: WidgetSlot[];
  isOn: (k: WidgetKey) => boolean;
  setOn: (k: WidgetKey, on: boolean) => void;
  setWidth: (k: WidgetKey, w: WidgetWidth) => void;
  /** Move a widget one place up (-1) or down (+1). */
  move: (k: WidgetKey, dir: -1 | 1) => void;
  resetLayout: () => void;
  completeOnboarding: (selected: WidgetKey[]) => void;
}

const WidgetPrefsContext = createContext<WidgetPrefsContextValue | null>(null);

export function WidgetPrefsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const st = useAppState();
  const [migrated, setMigrated] = useState(false);

  // The layout now lives in the synced state blob, so a feed arranged on one
  // device shows up the same on another. Anything already in AsyncStorage from
  // before is adopted once, then that copy stops being read.
  useEffect(() => {
    if (!st.loaded) return;
    let cancelled = false;
    (async () => {
      if (st.widgets.length) {
        if (!cancelled) setMigrated(true);
        return;
      }
      const old = await migrateFromAsyncStorage(user?.id ?? null);
      if (cancelled) return;
      if (old) st.setWidgets(completeLayout(old.layout), old.onboarded);
      else st.setWidgets(defaultLayout(), false);
      setMigrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.loaded, st.widgets.length, user?.id]);

  const layout = st.widgets.length ? completeLayout(st.widgets as WidgetSlot[]) : defaultLayout();
  const write = (next: WidgetSlot[], onboarded?: boolean) => st.setWidgets(next, onboarded);

  const isOn = (k: WidgetKey) => layout.find((w) => w.key === k)?.on ?? DEFAULT_ON.includes(k);

  const setOn = (k: WidgetKey, on: boolean) =>
    write(layout.map((w) => (w.key === k ? { ...w, on } : w)));

  const setWidth = (k: WidgetKey, width: WidgetWidth) =>
    write(layout.map((w) => (w.key === k ? { ...w, width } : w)));

  const move = (k: WidgetKey, dir: -1 | 1) => {
    const i = layout.findIndex((w) => w.key === k);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layout.length) return;
    const next = layout.slice();
    [next[i], next[j]] = [next[j], next[i]];
    write(next);
  };

  const resetLayout = () => write(defaultLayout());

  const completeOnboarding = (selected: WidgetKey[]) =>
    write(
      layout.map((w) => ({ ...w, on: selected.includes(w.key as WidgetKey) })),
      true
    );

  return (
    <WidgetPrefsContext.Provider
      value={{
        ready: st.loaded && migrated,
        onboarded: st.onboarded,
        layout,
        isOn,
        setOn,
        setWidth,
        move,
        resetLayout,
        completeOnboarding,
      }}
    >
      {children}
    </WidgetPrefsContext.Provider>
  );
}

export function useWidgetPrefs() {
  const ctx = useContext(WidgetPrefsContext);
  if (!ctx) throw new Error("useWidgetPrefs must be used within WidgetPrefsProvider");
  return ctx;
}
