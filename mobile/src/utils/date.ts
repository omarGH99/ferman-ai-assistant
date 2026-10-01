import { EventItem } from "../state/types";

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");

export const iso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const todayISO = () => iso(new Date());

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d: Date) {
  const x = new Date(d);
  const g = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - g);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function sameISO(d: Date, s: string) {
  return iso(d) === s;
}

export function nextWeekday(js: number) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = addDays(t, i);
    if (d.getDay() === js) return d;
  }
  return t;
}

export function eventsOnDate(events: EventItem[], d: Date) {
  const s = iso(d);
  const out: EventItem[] = [];
  for (const e of events) {
    if (e.date === s) out.push(e);
    else if (e.recur && e.recur.days.includes(d.getDay()) && s >= e.recur.from && s <= e.recur.to)
      out.push(e);
  }
  return out.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
}

export function recurLabel(e: EventItem) {
  if (!e.recur) return "";
  return "↻ " + e.recur.days.map((js) => DOW[(js + 6) % 7]).join(",");
}

export function timeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const m = String(t).match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let hr = parseInt(m[1], 10);
  const mi = m[2] ? parseInt(m[2], 10) : 0;
  const ap = (m[3] || "").toLowerCase();
  if (ap === "pm" && hr < 12) hr += 12;
  if (ap === "am" && hr === 12) hr = 0;
  return hr * 60 + mi;
}
