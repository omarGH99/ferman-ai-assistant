import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, ContactItem, EventItem, ShoppingItem, Status, WaterState, WidgetSlot } from "./types";
import { todayISO } from "../utils/date";
import { cancelEventNotifications, scheduleEventNotifications } from "../services/notifications";
import { useAuth } from "./AuthProvider";
import { getStateApi, putStateApi } from "../services/auth";

// Local cache is namespaced per account so switching users never leaks data and
// each account keeps an offline copy of its own tasks.
const KEY_PREFIX = "assistant_state_v4";
const keyFor = (userId: number | null | undefined) =>
  userId ? `${KEY_PREFIX}:${userId}` : KEY_PREFIX;

const SYNC_DEBOUNCE_MS = 1500;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const DEFAULT_WATER_GOAL_ML = 2000;
const WATER_GOAL_MIN = 500;
const WATER_GOAL_MAX = 6000;

function blankWater(): WaterState {
  return { goalMl: DEFAULT_WATER_GOAL_ML, date: todayISO(), ml: 0 };
}

function blank(): AppState {
  return { events: [], shopping: [], contacts: [], water: blankWater(), widgets: [], onboarded: false, updatedAt: 0 };
}

// Tolerantly coerce anything loaded from storage / the server into a valid AppState.
// State saved before a field existed simply gets its default, so an account that
// syncs from an older device isn't rejected.
function normalize(raw: any): AppState {
  const events: EventItem[] = Array.isArray(raw?.events) ? raw.events : [];
  const shopping: ShoppingItem[] = (Array.isArray(raw?.shopping) ? raw.shopping : []).map(
    (x: any) => (typeof x === "string" ? { name: x, checked: false } : x)
  );
  const contacts: ContactItem[] = (Array.isArray(raw?.contacts) ? raw.contacts : [])
    .filter((c: any) => c && typeof c.name === "string")
    .map((c: any) => ({
      id: String(c.id || uid()),
      name: c.name,
      phone: String(c.phone || ""),
      note: String(c.note || ""),
    }));
  const w = raw?.water;
  const water: WaterState = {
    goalMl: clampGoal(Number(w?.goalMl) || DEFAULT_WATER_GOAL_ML),
    date: typeof w?.date === "string" ? w.date : todayISO(),
    ml: Math.max(0, Number(w?.ml) || 0),
  };
  // Widget layout arrives from another device or an older build; keep only
  // well-formed slots and let the provider that owns the catalogue decide which
  // keys are real.
  const widgets: WidgetSlot[] = (Array.isArray(raw?.widgets) ? raw.widgets : [])
    .filter((w: any) => w && typeof w.key === "string")
    .map((w: any) => ({ key: w.key, on: !!w.on, width: w.width === "half" ? "half" : "full" }));

  return {
    events,
    shopping,
    contacts,
    water,
    widgets,
    onboarded: !!raw?.onboarded,
    updatedAt: Number(raw?.updatedAt) || 0,
  };
}

function clampGoal(ml: number) {
  return Math.min(WATER_GOAL_MAX, Math.max(WATER_GOAL_MIN, Math.round(ml / 100) * 100));
}

// What we send to the cloud: strip device-local notification identifiers so they
// never travel between devices (each device schedules its own).
function forSync(s: AppState): AppState {
  return {
    updatedAt: s.updatedAt,
    shopping: s.shopping,
    contacts: s.contacts,
    water: s.water,
    widgets: s.widgets,
    onboarded: s.onboarded,
    events: s.events.map(({ notifIds, ...rest }) => rest as EventItem),
  };
}

interface StateContextValue {
  loaded: boolean;
  events: EventItem[];
  shopping: ShoppingItem[];
  addEvent: (partial: Partial<EventItem> & { title: string }) => EventItem;
  updateEvent: (id: string, patch: Partial<EventItem>) => void;
  deleteEvent: (id: string) => void;
  restoreEvent: (event: EventItem) => void;
  restoreShopping: (items: ShoppingItem[]) => void;
  setEventStatus: (id: string, status: Status) => void;
  addShoppingItem: (name: string, list?: string) => void;
  contacts: ContactItem[];
  addContact: (name: string, phone?: string, note?: string) => void;
  removeContact: (id: string) => void;
  restoreContacts: (items: ContactItem[]) => void;
  removeShoppingByText: (text: string) => boolean;
  removeShoppingAt: (index: number) => void;
  toggleShoppingChecked: (index: number) => void;
  clearShopping: () => void;
  clearCheckedShopping: () => void;
  clearAllData: () => void;
  findEventByText: (text: string, kind?: "reminder" | "alarm") => EventItem | null;
  /** Always reported for today — a stored total from a previous day reads as 0. */
  water: WaterState;
  widgets: WidgetSlot[];
  onboarded: boolean;
  setWidgets: (widgets: WidgetSlot[], onboarded?: boolean) => void;
  addWater: (ml: number) => void;
  setWaterGoal: (ml: number) => void;
}

const StateContext = createContext<StateContextValue | null>(null);

export function StateProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [state, setState] = useState<AppState>(blank());
  const [loaded, setLoaded] = useState(false);
  const loadedRef = useRef(false);

  // Sync bookkeeping.
  const userIdRef = useRef<number | null>(null);
  const lastSyncedRef = useRef(0); // updatedAt value last confirmed on the server
  const [syncReady, setSyncReady] = useState(false); // true after the initial pull

  // stamp() marks a real content change so the sync effect knows to push.
  const stamp = (s: AppState): AppState => ({ ...s, updatedAt: Date.now() });

  // Load this account's local cache, then reconcile with the server (last write
  // wins). Re-runs whenever the signed-in user changes.
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    userIdRef.current = currentUserId;
    loadedRef.current = false;
    lastSyncedRef.current = 0;
    setLoaded(false);
    setSyncReady(false);
    let cancelled = false;

    (async () => {
      // 1) local cache for this account
      let localState = blank();
      try {
        let raw = await AsyncStorage.getItem(keyFor(currentUserId));
        // One-time migration: adopt tasks saved before sync existed (the old
        // un-namespaced cache) so a returning user doesn't appear to lose them.
        if (!raw && currentUserId) raw = await AsyncStorage.getItem(KEY_PREFIX);
        if (raw) localState = normalize(JSON.parse(raw));
      } catch {
        // corrupt storage — start blank
      }
      if (cancelled) return;
      setState(localState);
      loadedRef.current = true;
      setLoaded(true);

      // 2) reconcile with the server when signed in
      if (token) {
        try {
          const remote = await getStateApi(token);
          if (cancelled) return;
          const remoteUpdated = remote.updated_at ? Number(remote.updated_at) : 0;
          if (remote.state && remoteUpdated > localState.updatedAt) {
            // server is newer — adopt it and reschedule this device's reminders
            const adopted = { ...normalize(remote.state), updatedAt: remoteUpdated };
            lastSyncedRef.current = remoteUpdated;
            setState(adopted);
            rescheduleAll(adopted.events);
          } else {
            // local is newer or server is empty — the push effect uploads local.
            lastSyncedRef.current = remoteUpdated;
            const hasContent = localState.events.length || localState.shopping.length;
            if (hasContent && localState.updatedAt <= remoteUpdated) {
              // migrated/pre-sync data has updatedAt 0; bump it so it actually
              // uploads instead of waiting for the next edit.
              setState((s) => ({ ...s, updatedAt: Date.now() }));
            }
          }
        } catch {
          // offline — keep working locally; changes upload once reachable
          lastSyncedRef.current = 0;
        }
      }
      if (!cancelled) setSyncReady(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token]);

  // Persist every change to this account's local cache (includes notifIds).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
    if (!loadedRef.current) return;
    AsyncStorage.setItem(keyFor(userIdRef.current), JSON.stringify(state)).catch(() => {});
  }, [state]);

  // Push content changes to the server, debounced. Only fires when updatedAt has
  // advanced past what the server already has, so notifId-only writes don't sync.
  useEffect(() => {
    if (!syncReady || !token) return;
    if (state.updatedAt <= lastSyncedRef.current) return;
    const at = state.updatedAt;
    const snapshot = forSync(state);
    const t = setTimeout(() => {
      putStateApi(token, snapshot, at)
        .then(() => {
          lastSyncedRef.current = at;
        })
        .catch(() => {
          // leave lastSynced behind so the next change (or remount) retries
        });
    }, SYNC_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [state.updatedAt, syncReady, token]);

  // Write an event patch. `bump` controls whether this counts as a content change
  // (and therefore syncs); notification-id writes pass bump=false to stay local.
  function writeEvent(id: string, patch: Partial<EventItem>, bump = true) {
    setState((s) => {
      const idx = s.events.findIndex((e) => e.id === id);
      if (idx === -1) return s;
      const events = s.events.slice();
      events[idx] = { ...events[idx], ...patch };
      const next = { ...s, events };
      return bump ? stamp(next) : next;
    });
  }

  function rescheduleAll(events: EventItem[]) {
    events.forEach((e) => {
      scheduleEventNotifications(e).then((ids) => {
        if (ids.length) writeEvent(e.id, { notifIds: ids }, false);
      });
    });
  }

  function addEvent(partial: Partial<EventItem> & { title: string }): EventItem {
    const event: EventItem = {
      id: uid(),
      status: "pending",
      notes: "",
      date: null,
      time: "",
      recur: null,
      ...partial,
    };
    setState((s) => stamp({ ...s, events: [...s.events, event] }));
    scheduleEventNotifications(event).then((ids) => {
      if (ids.length) writeEvent(event.id, { notifIds: ids }, false);
    });
    return event;
  }

  function updateEvent(id: string, patch: Partial<EventItem>) {
    const needsReschedule = ["time", "date", "recur", "status"].some((k) => k in patch);
    writeEvent(id, patch, true);
    if (needsReschedule) {
      const current = stateRef.current.events.find((e) => e.id === id);
      if (current) {
        const merged = { ...current, ...patch };
        scheduleEventNotifications(merged).then((ids) => {
          writeEvent(id, { notifIds: ids }, false);
        });
      }
    }
  }

  function deleteEvent(id: string) {
    setState((s) => {
      const ev = s.events.find((e) => e.id === id);
      if (ev) cancelEventNotifications(ev);
      return stamp({ ...s, events: s.events.filter((e) => e.id !== id) });
    });
  }

  function setEventStatus(id: string, status: Status) {
    updateEvent(id, { status });
  }

  /** Put a deleted event back exactly as it was — same id, same status — so
   * undo restores rather than re-creates. addEvent would mint a new id and
   * reset the status to pending, quietly losing "done". */
  function restoreEvent(event: EventItem) {
    setState((s) =>
      s.events.some((e) => e.id === event.id) ? s : stamp({ ...s, events: [...s.events, event] })
    );
    scheduleEventNotifications(event).then((ids) => {
      if (ids.length) writeEvent(event.id, { notifIds: ids }, false);
    });
  }

  /** Undo for the clear-list buttons. Replaces rather than appends: the user is
   * putting back the list they just wiped, not adding to whatever is there. */
  function restoreShopping(items: ShoppingItem[]) {
    setState((s) => stamp({ ...s, shopping: items }));
  }

  function addShoppingItem(name: string, list?: string) {
    const trimmed = (list || "").trim();
    setState((s) =>
      stamp({ ...s, shopping: [...s.shopping, { name, checked: false, ...(trimmed ? { list: trimmed } : {}) }] })
    );
  }

  function addContact(name: string, phone = "", note = "") {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState((s) =>
      stamp({ ...s, contacts: [...s.contacts, { id: uid(), name: trimmed, phone: phone.trim(), note }] })
    );
  }

  function removeContact(id: string) {
    setState((s) => stamp({ ...s, contacts: s.contacts.filter((c) => c.id !== id) }));
  }

  function restoreContacts(items: ContactItem[]) {
    setState((s) => stamp({ ...s, contacts: items }));
  }

  function removeShoppingByText(text: string): boolean {
    const needle = text.toLowerCase();
    let removed = false;
    setState((s) => {
      const before = s.shopping.length;
      const shopping = s.shopping.filter((x) => !x.name.toLowerCase().includes(needle));
      removed = shopping.length < before;
      return removed ? stamp({ ...s, shopping }) : s;
    });
    return removed;
  }

  function removeShoppingAt(index: number) {
    setState((s) => stamp({ ...s, shopping: s.shopping.filter((_, i) => i !== index) }));
  }

  function toggleShoppingChecked(index: number) {
    setState((s) => {
      const shopping = s.shopping.slice();
      shopping[index] = { ...shopping[index], checked: !shopping[index].checked };
      return stamp({ ...s, shopping });
    });
  }

  function clearShopping() {
    setState((s) => stamp({ ...s, shopping: [] }));
  }

  function clearCheckedShopping() {
    setState((s) => stamp({ ...s, shopping: s.shopping.filter((x) => !x.checked) }));
  }

  function clearAllData() {
    setState((s) => {
      s.events.forEach((e) => cancelEventNotifications(e));
      return stamp(blank());
    });
  }

  // Water. The stored total belongs to a specific day, so anything left over
  // from yesterday is treated as zero rather than being carried forward — the
  // rollover happens on read, so it works without the app being open at midnight.
  const waterToday: WaterState =
    state.water.date === todayISO() ? state.water : { ...state.water, date: todayISO(), ml: 0 };

  function addWater(ml: number) {
    setState((s) => {
      const today = todayISO();
      const base = s.water.date === today ? s.water.ml : 0;
      return stamp({
        ...s,
        water: { ...s.water, date: today, ml: Math.max(0, base + ml) },
      });
    });
  }

  function setWidgets(widgets: WidgetSlot[], onboarded?: boolean) {
    setState((s) => stamp({ ...s, widgets, onboarded: onboarded ?? s.onboarded }));
  }

  function setWaterGoal(ml: number) {
    setState((s) => stamp({ ...s, water: { ...s.water, goalMl: clampGoal(ml) } }));
  }

  function findEventByText(text: string, kind?: "reminder" | "alarm"): EventItem | null {
    const low = text.toLowerCase();
    let best: EventItem | null = null;
    let bestLen = 0;
    for (const e of state.events) {
      if (!e.title) continue;
      if (kind && (e.kind || "reminder") !== kind) continue;
      const words = e.title.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      if (!words.length) continue;
      const hits = words.filter((w) => low.includes(w));
      if (hits.length && hits.join("").length > bestLen) {
        best = e;
        bestLen = hits.join("").length;
      }
    }
    return best;
  }

  const value: StateContextValue = {
    loaded,
    events: state.events,
    shopping: state.shopping,
    addEvent,
    updateEvent,
    deleteEvent,
    restoreEvent,
    restoreShopping,
    setEventStatus,
    addShoppingItem,
    contacts: state.contacts,
    addContact,
    removeContact,
    restoreContacts,
    removeShoppingByText,
    removeShoppingAt,
    toggleShoppingChecked,
    clearShopping,
    clearCheckedShopping,
    clearAllData,
    findEventByText,
    widgets: state.widgets,
    onboarded: state.onboarded,
    setWidgets,
    water: waterToday,
    addWater,
    setWaterGoal,
  };

  return <StateContext.Provider value={value}>{children}</StateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(StateContext);
  if (!ctx) throw new Error("useAppState must be used within StateProvider");
  return ctx;
}
