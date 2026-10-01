import { timeToMinutes } from "./date";

// ISO "YYYY-MM-DD" <-> Date
export function isoToDate(iso: string): Date {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export function dateToIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// free-text time ("5 pm", "17:00") <-> Date (today's date, that time)
export function timeStrToDate(s: string): Date {
  const mins = timeToMinutes(s);
  const d = new Date();
  if (mins != null) d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  else d.setHours(9, 0, 0, 0);
  return d;
}

export function dateToTimeStr(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

// free-text time <-> "HH:MM" (for the web <input type="time">)
export function timeStrTo24(s: string): string {
  const mins = timeToMinutes(s);
  if (mins == null) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(mins / 60))}:${p(mins % 60)}`;
}

export function time24ToStr(v: string): string {
  if (!v) return "";
  const [h, m] = v.split(":").map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return dateToTimeStr(d);
}
