import { DEFAULT_PLACE } from "../config";
import { getCoords } from "./location";
import { normDigits } from "../utils/nlp";

/** Open-Meteo's WMO code -> a translation key. Returning a key rather than an
 * English word is what lets the reply be built in any language. */
export function wdescKey(c: number): string {
  if (c === 0) return "wx_clear";
  if (c <= 3) return "wx_partly";
  if (c <= 48) return "wx_fog";
  if (c <= 57) return "wx_drizzle";
  if (c <= 67) return "wx_rain";
  if (c <= 77) return "wx_snow";
  if (c <= 82) return "wx_showers";
  if (c <= 86) return "wx_snow_showers";
  return "wx_storm";
}

export function weatherEmoji(c: number): string {
  if (c === 0) return "☀️";
  if (c <= 3) return "⛅";
  if (c <= 48) return "🌫️";
  if (c <= 57) return "🌦️";
  if (c <= 67) return "🌧️";
  if (c <= 77) return "❄️";
  if (c <= 82) return "🌧️";
  if (c <= 86) return "🌨️";
  return "⛈️";
}

function parseHour(text: string): number | null {
  const low = normDigits(text).toLowerCase();
  const m = low.match(/\b(\d{1,2})\s*(am|pm)\b/) || low.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m) {
    let hr = parseInt(m[1], 10);
    if (/pm/.test(low) && hr < 12) hr += 12;
    if (/am/.test(low) && hr === 12) hr = 0;
    return Math.min(23, Math.max(0, hr));
  }
  if (/morning|صباح|سپێدێ|بەیانی/.test(low)) return 9;
  if (/noon|midday|ظهر|نیڤرو/.test(low)) return 12;
  if (/afternoon|عصر|پشتی نیڤرو/.test(low)) return 15;
  if (/evening|night|مساء|ليل|ئێڤار|شەڤ/.test(low)) return 20;
  return null;
}

export async function getWeatherReply(text: string, t: (k: string) => string): Promise<string> {
  const { latitude: lat, longitude: lon, usedDevice } = await getCoords();
  const place = usedDevice ? "your area" : "Duhok";
  try {
    const tomorrow = /tomorrow|غد|سبەین|سبەهی|سبەی|سوبەهی/.test(text.toLowerCase());
    const hour = parseHour(text);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;
    const d = await (await fetch(url)).json();
    if (hour != null && d.hourly && d.hourly.time) {
      const day = tomorrow ? 1 : 0;
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, hour);
      const pad = (n: number) => String(n).padStart(2, "0");
      const key = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(hour)}:00`;
      const idx = d.hourly.time.indexOf(key);
      if (idx >= 0) {
        const temp = Math.round(d.hourly.temperature_2m[idx]);
        const lbl = hour === 0 ? "12 AM" : hour < 12 ? hour + " AM" : hour === 12 ? "12 PM" : hour - 12 + " PM";
        return `${place} · ${lbl} · ${t(wdescKey(d.hourly.weather_code[idx]))} · ${temp}°C`;
      }
    }
    if (tomorrow) {
      const mx = Math.round(d.daily.temperature_2m_max[1]);
      const mn = Math.round(d.daily.temperature_2m_min[1]);
      return `${place} · ${t("tomorrow_lbl")} · ${t(wdescKey(d.daily.weather_code[1]))} · ${mn}–${mx}°C`;
    }
    return `${place} · ${t(wdescKey(d.current.weather_code))} · ${Math.round(d.current.temperature_2m)}°C`;
  } catch {
    return t("e_weather");
  }
}

export interface FeedWeather {
  tempNow: number;
  descKey: string;
  min: number;
  max: number;
  place: string;
}

export interface DayForecast {
  date: string; // ISO
  weekdayIdx: number; // 0=Sun..6=Sat
  code: number;
  min: number;
  max: number;
}

export async function getWeekForecast(): Promise<DayForecast[] | null> {
  const { latitude: lat, longitude: lon } = await getCoords();
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;
    const d = await (await fetch(url)).json();
    const days: DayForecast[] = [];
    const n = Math.min(7, d.daily.time.length);
    for (let i = 0; i < n; i++) {
      const date = d.daily.time[i];
      days.push({
        date,
        weekdayIdx: new Date(date + "T00:00:00").getDay(),
        code: d.daily.weather_code[i],
        min: Math.round(d.daily.temperature_2m_min[i]),
        max: Math.round(d.daily.temperature_2m_max[i]),
      });
    }
    return days.length ? days : null;
  } catch {
    return null;
  }
}

export async function getFeedWeather(): Promise<FeedWeather | null> {
  const { latitude: lat, longitude: lon, usedDevice, place: saved } = await getCoords();
  const place = saved || (usedDevice ? "Your area" : DEFAULT_PLACE);
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;
    const d = await (await fetch(url)).json();
    return {
      tempNow: Math.round(d.current.temperature_2m),
      descKey: wdescKey(d.current.weather_code),
      min: Math.round(d.daily.temperature_2m_min[0]),
      max: Math.round(d.daily.temperature_2m_max[0]),
      place,
    };
  } catch {
    return null;
  }
}
