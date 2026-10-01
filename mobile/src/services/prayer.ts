import { getCoords } from "./location";
import { getPrayerMethod } from "./prefs";

const WANT: [string, string][] = [
  ["Fajr", "Fajr"],
  ["Dhuhr", "Dhuhr"],
  ["Asr", "Asr"],
  ["Maghrib", "Maghrib"],
  ["Isha", "Isha"],
];

export interface PrayerRow {
  key: string;
  label: string;
  time: string;
  isNext: boolean;
}

export interface PrayerData {
  rows: PrayerRow[];
  hijri: string;
  qibla: number; // degrees clockwise from true north
}

const KAABA = { lat: 21.4225, lon: 39.8262 };

/** Great-circle initial bearing from the user to the Kaaba.
 *
 * Computed locally rather than via Aladhan's /qibla endpoint: it is a closed-form
 * formula, so a network round-trip would buy nothing and would fail offline.
 * Verified against that endpoint — Duhok, Erbil and Baghdad all agree to four
 * decimal places.
 *
 * This is a bearing from true north, not a live pointer: the app has no reliable
 * compass on the web build, so the UI states the angle rather than drawing an
 * arrow that would look like it should track the device.
 */
export function qiblaBearing(lat: number, lon: number): number {
  const rad = Math.PI / 180;
  const p1 = lat * rad;
  const p2 = KAABA.lat * rad;
  const dl = (KAABA.lon - lon) * rad;
  const theta = Math.atan2(
    Math.sin(dl) * Math.cos(p2),
    Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)
  );
  return (theta / rad + 360) % 360;
}

export async function getPrayerTimes(): Promise<PrayerData | null> {
  const { latitude, longitude } = await getCoords();
  const method = await getPrayerMethod();
  try {
    const d = await (
      await fetch(
        `https://api.aladhan.com/v1/timings?latitude=${latitude}&longitude=${longitude}&method=${method}`
      )
    ).json();
    const t = d.data.timings;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let nextName: string | null = null;
    for (const [k] of WANT) {
      const [h, m] = t[k].split(":").map(Number);
      if (h * 60 + m >= nowMin) {
        nextName = k;
        break;
      }
    }
    if (!nextName) nextName = "Fajr";
    const rows = WANT.map(([k, lbl]) => ({ key: k, label: lbl, time: t[k], isNext: k === nextName }));
    const hijri = d.data.date && d.data.date.hijri ? d.data.date.hijri.date : "";
    return { rows, hijri, qibla: qiblaBearing(latitude, longitude) };
  } catch {
    return null;
  }
}
