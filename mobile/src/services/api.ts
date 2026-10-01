import { API_BASE_URL } from "../config";
import { ParseResult } from "../state/types";

function mock(text: string): ParseResult {
  const t = text.toLowerCase();
  const has = (words: string[]) => words.some((x) => t.includes(x));
  let intent = "general_quirky";
  let candidates = ["general_quirky", "calendar_set", "lists_add"];
  if (has(["weather", "طقس", "کەش"])) {
    intent = "weather_query";
    candidates = ["weather_query", "general_quirky", "datetime_query"];
  } else if (has(["remind", "schedul", "meeting", "call", "ذكر", "بیر"])) {
    intent = "calendar_set";
    candidates = ["calendar_set", "alarm_set", "lists_add"];
  } else if (has(["alarm", "منبه", "زەنگ"])) {
    intent = "alarm_set";
    candidates = ["alarm_set", "calendar_set", "lists_add"];
  } else if (has(["play", "music", "مۆسیقا", "موسيقى"])) {
    intent = "play_music";
    candidates = ["play_music", "play_radio", "music_query"];
  } else if (has(["add", "list", "قائمة", "لیست"])) {
    intent = "lists_add";
    candidates = ["lists_add", "calendar_set", "lists_remove"];
  }
  return { intent, slots: {}, confidence: 0.55, candidates, mock: true };
}

// Cloud Run scales to zero, so the first request after ~15 min idle waits
// ~15-30 s while the container starts and both models load. Nothing in the UI
// used to acknowledge that, which reads as "the app is broken".
//
// Two mitigations: warmUp() below gets the wake-up started while the user is
// still reading the feed or typing, and onSlow lets callers show a "waking
// up..." message once a request has clearly hit a cold start rather than
// flashing it on every fast request.
export const SLOW_REQUEST_MS = 2500;

let warmed = false;

/** Fire-and-forget ping that starts the container booting. Safe to call often;
 * only the first call per session actually goes out. */
export function warmUp(): void {
  if (warmed || !API_BASE_URL) return;
  warmed = true;
  fetch(`${API_BASE_URL}/health`).catch(() => {
    warmed = false; // let a later attempt retry after e.g. an offline start
  });
}

/** Resolves true if `p` has not settled within `ms`, so callers can show a
 * cold-start hint. The timer is always cleared, so no stray callbacks fire. */
export async function withSlowNotice<T>(
  p: Promise<T>,
  onSlow: () => void,
  ms = SLOW_REQUEST_MS
): Promise<T> {
  const timer = setTimeout(onSlow, ms);
  try {
    return await p;
  } finally {
    clearTimeout(timer);
  }
}

export async function parseCommand(text: string): Promise<ParseResult> {
  try {
    const r = await fetch(`${API_BASE_URL}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: "auto" }),
    });
    if (!r.ok) throw new Error(String(r.status));
    warmed = true;
    return await r.json();
  } catch {
    return mock(text);
  }
}

export interface NewsItem {
  title: string;
  url: string;
}

export interface NewsResult {
  source: string;
  items: NewsItem[];
  ok: boolean;
}

/** Regional news in the given UI language — Kurdish gets Kurdistan24, Arabic
 * and English get Google News scoped to Iraq. Defaults to Kurdish to match the
 * previous behaviour when no language is passed (e.g. the chat's news intent). */
export async function getNews(lang: string = "ku"): Promise<NewsResult> {
  try {
    const r = await fetch(`${API_BASE_URL}/news?lang=${encodeURIComponent(lang)}`);
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return { source: "Kurdistan24", items: [], ok: false };
  }
}

export async function getTrending(): Promise<NewsResult> {
  try {
    const r = await fetch(`${API_BASE_URL}/trending`);
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return { source: "Google News", items: [], ok: false };
  }
}

export interface HistoryItem {
  year: string;
  text: string;
}

export interface HistoryResult {
  items: HistoryItem[];
  ok: boolean;
}

export interface Holiday {
  date: string; // ISO
  key: string; // stable id for translation; "" when the source name has no key
  name: string; // English name from the source, used as the fallback label
}

export async function getHolidays(): Promise<{ items: Holiday[]; ok: boolean }> {
  try {
    const r = await fetch(`${API_BASE_URL}/holidays`);
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return { items: [], ok: false };
  }
}

export async function getHistory(): Promise<HistoryResult> {
  try {
    const r = await fetch(`${API_BASE_URL}/onthisday`);
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return { items: [], ok: false };
  }
}
