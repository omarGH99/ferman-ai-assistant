import AsyncStorage from "@react-native-async-storage/async-storage";

/** App preferences that services need to read *outside* React.
 *
 * Weather, air quality, prayer times and the notification scheduler are plain
 * async functions, not hooks, so they can't consume a context. They read these
 * getters instead, and PrefsProvider writes through the same keys — one source
 * of truth, reachable from both sides.
 *
 * Deliberately not per-account: like theme and language, these describe the
 * device and the person using it, not the logged-in account.
 */
const K_CITY = "pref_city";
const K_PRAYER_METHOD = "pref_prayer_method";
const K_QUIET = "pref_quiet_hours";

export interface SavedCity {
  name: string;
  latitude: number;
  longitude: number;
}

/** Aladhan calculation method. 3 = Muslim World League — a defensible regional
 * default, but Iraq is religiously mixed, which is why this is a setting.
 * See PRAYER_METHODS for the options offered. */
export const DEFAULT_PRAYER_METHOD = 3;

export const PRAYER_METHODS: { id: number; key: string }[] = [
  { id: 3, key: "pm_mwl" },
  { id: 5, key: "pm_egypt" },
  { id: 4, key: "pm_makkah" },
  { id: 0, key: "pm_ithna" },
  { id: 7, key: "pm_tehran" },
  { id: 2, key: "pm_isna" },
];

export interface QuietHours {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

// Read once, then served from memory — these are hit on every weather, prayer
// and notification call, and AsyncStorage is a bridge hop on native.
let cache: { city?: SavedCity | null; method?: number; quiet?: QuietHours | null } = {};

export async function getSavedCity(): Promise<SavedCity | null> {
  if (cache.city !== undefined) return cache.city;
  try {
    const raw = await AsyncStorage.getItem(K_CITY);
    cache.city = raw ? (JSON.parse(raw) as SavedCity) : null;
  } catch {
    cache.city = null;
  }
  return cache.city;
}

export async function setSavedCity(city: SavedCity | null) {
  cache.city = city;
  if (city) await AsyncStorage.setItem(K_CITY, JSON.stringify(city));
  else await AsyncStorage.removeItem(K_CITY);
}

export async function getPrayerMethod(): Promise<number> {
  if (cache.method !== undefined) return cache.method;
  try {
    const raw = await AsyncStorage.getItem(K_PRAYER_METHOD);
    const n = raw == null ? NaN : Number(raw);
    cache.method = PRAYER_METHODS.some((m) => m.id === n) ? n : DEFAULT_PRAYER_METHOD;
  } catch {
    cache.method = DEFAULT_PRAYER_METHOD;
  }
  return cache.method;
}

export async function setPrayerMethod(id: number) {
  cache.method = id;
  await AsyncStorage.setItem(K_PRAYER_METHOD, String(id));
}

export async function getQuietHours(): Promise<QuietHours | null> {
  if (cache.quiet !== undefined) return cache.quiet;
  try {
    const raw = await AsyncStorage.getItem(K_QUIET);
    cache.quiet = raw ? (JSON.parse(raw) as QuietHours) : null;
  } catch {
    cache.quiet = null;
  }
  return cache.quiet;
}

export async function setQuietHours(q: QuietHours | null) {
  cache.quiet = q;
  if (q) await AsyncStorage.setItem(K_QUIET, JSON.stringify(q));
  else await AsyncStorage.removeItem(K_QUIET);
}

/** Is HH:MM inside the quiet window? Handles the normal case of a window that
 * crosses midnight (22:00 → 07:00), where start > end. */
export function inQuietHours(hhmm: string, q: QuietHours | null): boolean {
  if (!q) return false;
  const m = (s: string) => {
    const [h, mm] = s.split(":").map(Number);
    return (h || 0) * 60 + (mm || 0);
  };
  const t = m(hhmm), a = m(q.start), b = m(q.end);
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

/** City search for the setting. Open-Meteo's geocoder — same provider as the
 * weather itself, keyless, and it returns the country so "Erbil" can be told
 * apart from a same-named place elsewhere. */
export interface CityHit extends SavedCity {
  country: string;
  admin: string;
}

export async function searchCities(q: string): Promise<CityHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  try {
    const r = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(term)}&count=8&language=en`
    );
    if (!r.ok) return [];
    const d = await r.json();
    return (d?.results || []).map((x: any) => ({
      name: x.name,
      latitude: x.latitude,
      longitude: x.longitude,
      country: x.country || "",
      admin: x.admin1 || "",
    }));
  } catch {
    return [];
  }
}
