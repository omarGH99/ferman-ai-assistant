import { MONTHS, addDays, iso, nextWeekday, todayISO } from "./date";
import { Slots } from "../state/types";

// Badini root forms (دووشەم, سێشەم, چوارشەم, پێنجشەم/پێنجەم, ئینی, یەکشەم) added
// after cross-checking XLMR_dataset_4lang_v2.csv's actual [date: ...] slot
// values — Badini's less-standardized orthography uses several written forms
// per weekday that the original Sorani-leaning keyword list didn't cover.
export const WD: { js: number; kw: string[] }[] = [
  { js: 1, kw: ["monday", "mon", "الإثنين", "الاثنين", "دووشەممە", "دووشەمبی", "دووشەم"] },
  { js: 2, kw: ["tuesday", "tue", "الثلاثاء", "سێشەممە", "سێشەمبی", "سێشەم"] },
  { js: 3, kw: ["wednesday", "wed", "الأربعاء", "الاربعاء", "چوارشەممە", "چوارشەمبی", "چوارشەم"] },
  { js: 4, kw: ["thursday", "thu", "الخميس", "پێنجشەممە", "پێنجشەمبی", "پێنجشەم", "پێنجەم"] },
  { js: 5, kw: ["friday", "fri", "الجمعة", "هەینی", "جومعە", "ئینی"] },
  { js: 6, kw: ["saturday", "sat", "السبت", "شەممە"] },
  { js: 0, kw: ["sunday", "sun", "الأحد", "الاحد", "أحد", "احد", "یەکشەممە", "یەکشەمبی", "یەکشەم"] },
];

const REC_KW = ["every", "each", "weekly", "كل", "هەموو", "هەر"];

export function findWeekdays(low: string) {
  const days: number[] = [];
  WD.forEach((w) => {
    if (w.kw.some((k) => low.includes(k))) days.push(w.js);
  });
  return days;
}

export function normDigits(s: string) {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function parseTime(text: string, slots?: Slots) {
  if (slots && slots.time) return slots.time;
  text = normDigits(text);
  const m =
    text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
    text.match(/\b(\d{1,2}):(\d{2})\b/) ||
    text.match(/(?:دەمژمێر|سعات|کاتژمێر|کاتژمێرێک|الساعة)\s*(\d{1,2})(?::(\d{2}))?/);
  if (!m) return "";
  const digits = m[0].match(/\d{1,2}(:\d{2})?/);
  return digits ? digits[0] : m[0];
}

// Arabic (Gregorian) month names -> 0-based index.
const AR_MONTHS: Record<string, number> = {
  "يناير": 0, "كانون الثاني": 0, "فبراير": 1, "شباط": 1, "مارس": 2, "آذار": 2,
  "أبريل": 3, "ابريل": 3, "نيسان": 3, "مايو": 4, "أيار": 4, "ايار": 4,
  "يونيو": 5, "حزيران": 5, "يوليو": 6, "تموز": 6, "أغسطس": 7, "اغسطس": 7, "آب": 7,
  "سبتمبر": 8, "أيلول": 8, "ايلول": 8, "أكتوبر": 9, "اكتوبر": 9, "تشرين الأول": 9,
  "نوفمبر": 10, "تشرين الثاني": 10, "ديسمبر": 11, "كانون الأول": 11,
};

const EN_MONTHS_RE =
  "january|february|march|april|may|june|july|august|september|october|november|december|" +
  "jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec";

function enMonthIndex(tok: string): number {
  const t = tok.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.toLowerCase().startsWith(t));
}

// Turn an explicit calendar date in free text into an ISO string, or null.
// Handles "October 1st", "Oct 1", "1 October", "1st of October" and Arabic month
// names. If the date already passed this year, it rolls to next year.
export function parseExplicitDate(low: string): string | null {
  let monthIdx = -1;
  let day = -1;

  let m = low.match(new RegExp("\\b(" + EN_MONTHS_RE + ")\\b\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?", "i"));
  if (m) {
    monthIdx = enMonthIndex(m[1]);
    day = parseInt(m[2], 10);
  }
  if (monthIdx < 0) {
    m = low.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(" + EN_MONTHS_RE + ")\\b", "i"));
    if (m) {
      monthIdx = enMonthIndex(m[2]);
      day = parseInt(m[1], 10);
    }
  }
  if (monthIdx < 0) {
    for (const [name, idx] of Object.entries(AR_MONTHS)) {
      if (low.includes(name)) {
        const dm = low.match(/(\d{1,2})/);
        if (dm) {
          monthIdx = idx;
          day = parseInt(dm[1], 10);
        }
        break;
      }
    }
  }
  if (monthIdx < 0 || day < 1 || day > 31) return null;

  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let d = new Date(now.getFullYear(), monthIdx, day);
  if (d.getTime() < todayMid.getTime()) d = new Date(now.getFullYear() + 1, monthIdx, day);
  return isNaN(d.getTime()) ? null : iso(d);
}

function parseMonthRange(low: string) {
  const m = low.match(/from\s+([a-z]+)\s+to\s+([a-z]+)/);
  if (!m) return null;
  const a = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m[1].slice(0, 3)));
  const b = MONTHS.findIndex((x) => x.toLowerCase().startsWith(m[2].slice(0, 3)));
  if (a < 0 || b < 0) return null;
  const y = new Date().getFullYear();
  return { from: iso(new Date(y, a, 1)), to: iso(new Date(y, b + 1, 0)) };
}

export interface WhenResult {
  recur: { days: number[]; from: string; to: string } | null;
  date: string | null;
  time: string;
  matched: boolean; // true when a real date/time/recurrence was detected (not the today fallback)
}

export function parseWhen(text: string, slots?: Slots): WhenResult {
  const low = normDigits(text).toLowerCase();
  const rec = REC_KW.some((k) => low.includes(k));
  const wds = findWeekdays(low);
  const time = parseTime(text, slots);

  if (rec && wds.length) {
    const r = parseMonthRange(low) || {
      from: todayISO(),
      to: iso(new Date(new Date().getFullYear(), 11, 31)),
    };
    return { recur: { days: wds, from: r.from, to: r.to }, date: null, time, matched: true };
  }
  if (/\btomorrow\b|غدا|سبەین|سبەهی|سبەی|سوبەهی/.test(low))
    return { recur: null, date: iso(addDays(new Date(), 1)), time, matched: true };
  if (/\btoday\b|اليوم|ئەمڕۆ|ئەڤرۆ/.test(low)) return { recur: null, date: todayISO(), time, matched: true };
  const explicit = parseExplicitDate(low);
  if (explicit) return { recur: null, date: explicit, time, matched: true };
  if (wds.length) return { recur: null, date: iso(nextWeekday(wds[0])), time, matched: true };
  if (slots && slots.date) {
    const d = new Date(slots.date);
    if (!isNaN(d.getTime())) return { recur: null, date: iso(d), time, matched: true };
  }
  // Nothing explicit: keep today as a usable default, but flag that we only have
  // a time (if any) — callers use `matched` to decide whether to confirm.
  return { recur: null, date: todayISO(), time, matched: !!time };
}

export function cleanTitle(text: string, slots?: Slots) {
  if (slots && slots.event) return slots.event;
  let s = normDigits(text).replace(
    /^(please\s+)?(add|remind me to|remind me|set(?:\s+(?:an?|the))?\s+(?:reminder|alarm|event)(?:\s+(?:to|for|about))?|set an?|create|schedule|book|make an?)\s+/i,
    ""
  );
  s = s.replace(/\bfrom\s+[a-z]+\s+to\s+[a-z]+\b/gi, " ");
  s = s.replace(new RegExp("\\b(" + MONTHS.join("|") + ")\\b", "gi"), " ");
  // month abbreviations too (excluding "may", which is a common word)
  s = s.replace(/\b(jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b\.?/gi, " ");
  WD.forEach((w) =>
    w.kw.forEach((k) => {
      s = s.replace(new RegExp("\\S*" + k + "\\S*", "gi"), " ");
    })
  );
  s = s
    .replace(/\b\d{1,2}(?:st|nd|rd|th)\b/gi, " ") // ordinal days: 1st, 2nd, 3rd…
    .replace(/\b(every|each|weekly|on|at|from|to|am|pm|today|tomorrow)\b/gi, " ")
    .replace(/(دەمژمێر|سعات|کاتژمێر|الساعة|بیرا من بینە|ذكرني)\s*/g, " ")
    .replace(/(^|\s)ل(\s|$)/g, " ")
    .replace(/\b\d{1,2}(:\d{2})?\b/g, " ")
    .replace(/[،,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s || text;
}

export function extractNotes(text: string): { clean: string; note: string } {
  const m = text.match(/notes?\s*\(([^)]*)\)/i);
  if (!m) return { clean: text, note: "" };
  const idx = m.index ?? 0;
  const clean = (text.slice(0, idx) + text.slice(idx + m[0].length)).replace(/\s+/g, " ").trim();
  return { clean, note: m[1].trim() };
}

export function cleanShoppingItem(text: string) {
  let s = " " + text + " ";
  s = s.replace(/\b(please|add|put|buy|get|to|my|the|onto|on|in|into|a|an)\b/gi, " ");
  s = s.replace(/\b(shopping|grocery|groceries)\s*(list)?\b/gi, " ").replace(/\blist\b/gi, " ");
  s = s.replace(/(أضف|اضف|ضع|اشتر|إلى|الى|على|في|قائمة|لائحة|التسوق|المشتريات|قايمة)/g, " ");
  s = s.replace(
    /(زێدەکە|زیادکە|زێدەکه|زیادبکە|زیاد|زێدە|بکە|بکه|زێدەکەن|سەر|بۆ|بو|لیستا|لیستی|لیست|بازاڕی|بازاڕ|کڕین)/g,
    " "
  );
  s = s.replace(/(^|\s)کە(\s|$)/g, " ");
  s = s.replace(/[،,]/g, " ").replace(/\s+/g, " ").trim();
  return s || text;
}
