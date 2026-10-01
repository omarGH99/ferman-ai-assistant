export type Status = "pending" | "inprogress" | "done" | "attended";

export interface Recur {
  days: number[]; // JS getDay() values: 0=Sun..6=Sat
  from: string; // ISO date
  to: string; // ISO date
}

export interface EventItem {
  id: string;
  title: string;
  status: Status;
  notes: string;
  date: string | null; // ISO date, null when recurring
  time: string; // "" | "9:00" | "9 am" etc (free text, parsed on demand)
  recur: Recur | null;
  notifIds?: string[]; // scheduled expo-notifications identifiers (one per recurring weekday, or one for a one-off date)
  kind?: "reminder" | "alarm"; // undefined treated as "reminder" for events saved before this field existed
}

export interface ShoppingItem {
  name: string;
  checked: boolean;
  /** Which named list this belongs to. Absent means the default list.
   *
   * Kept as a field on a flat array rather than nesting items inside list
   * objects: the model was trained on "add X to my Y list" (1,806 rows) so lists
   * need names, but nesting would rewrite every call site that touches shopping
   * — the chat actions, the feed card, sharing, the header badge — to buy the
   * same thing. */
  list?: string;
}

/** A person, stored locally. `email_addcontact` and `email_querycontact` were
 * trained on 604 rows and answered with a stub, because reading someone's inbox
 * needs OAuth and a security assessment. Storing a contact needs neither — only
 * the sending half of those intents is blocked. */
export interface ContactItem {
  id: string;
  name: string;
  phone: string;
  note: string;
}

export interface WaterState {
  goalMl: number; // daily target
  date: string; // ISO day that `ml` belongs to — anything older counts as 0
  ml: number; // drunk so far on `date`
}

export type WidgetWidth = "full" | "half";

/** One row of the user's feed, in feed order.
 *
 * `key` is loose here on purpose: this type lives in the synced blob, and
 * validating it against the widget catalogue belongs to the provider that owns
 * that catalogue. Typing it tightly would drag the widget registry — and the
 * icon set it imports — into the state layer.
 */
export interface WidgetSlot {
  key: string;
  on: boolean;
  width: WidgetWidth;
}

export interface AppState {
  events: EventItem[];
  shopping: ShoppingItem[];
  contacts: ContactItem[];
  water: WaterState;
  /** The feed's contents, order and per-widget width. Synced, so a feed the
   * user arranged on their phone looks the same on their laptop. */
  widgets: WidgetSlot[];
  /** Whether the first-run picker has been completed. Synced for the same
   * reason — a second device shouldn't re-run onboarding. */
  onboarded: boolean;
  updatedAt: number; // ms epoch of the last content change — drives last-write-wins sync
}

export interface Slots {
  [key: string]: string;
}

export interface SlotSpan {
  type: string;
  value: string;
  start: number;
  end: number;
}

export interface ParseResult {
  intent: string | null;
  slots: Slots;
  confidence: number | null;
  candidates: string[];
  /** Every extracted span, including repeats of the same type. `slots` keeps
   * only the first of each type. */
  slot_spans?: SlotSpan[];
  /** Server decided the prediction was too weak to act on (low probability or
   * a thin top-1/top-2 margin), so `intent` is null even though `candidates`
   * are populated. Common for the 26 intents dropped in the v2 model. */
  low_confidence?: boolean;
  translated?: string | null;
  mock?: boolean;
}
