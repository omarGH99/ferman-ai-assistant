import { DEFAULT_PLACE } from "../config";
import { getCoords } from "./location";

// Open-Meteo's air-quality API — same provider and the same coordinates as the
// weather card, no key. Dust is called out separately from the headline index
// because it is the pollutant that actually spikes here: a dust storm can leave
// PM2.5 unremarkable while PM10/dust go through the roof.

export type AqiBand = "good" | "fair" | "moderate" | "poor" | "very_poor" | "extreme";

export interface AirQuality {
  aqi: number;
  band: AqiBand;
  pm25: number;
  pm10: number;
  dust: number;
  uv: number;
  place: string;
}

/** European AQI bands, as published by the EEA. */
export function aqiBand(aqi: number): AqiBand {
  if (aqi <= 20) return "good";
  if (aqi <= 40) return "fair";
  if (aqi <= 60) return "moderate";
  if (aqi <= 80) return "poor";
  if (aqi <= 100) return "very_poor";
  return "extreme";
}

/** Rough dust thresholds (µg/m³) for surfacing a "dusty today" hint. */
export function dustLevel(dust: number): "low" | "notable" | "high" {
  if (dust >= 200) return "high";
  if (dust >= 50) return "notable";
  return "low";
}

export async function getAirQuality(): Promise<AirQuality | null> {
  const { latitude: lat, longitude: lon, usedDevice, place: saved } = await getCoords();
  const place = saved || (usedDevice ? "Your area" : DEFAULT_PLACE);
  try {
    const url =
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
      `&current=pm10,pm2_5,dust,uv_index,european_aqi&timezone=auto`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const c = d?.current;
    if (!c || typeof c.european_aqi !== "number") return null;
    const num = (v: any) => (typeof v === "number" ? Math.round(v) : 0);
    return {
      aqi: Math.round(c.european_aqi),
      band: aqiBand(c.european_aqi),
      pm25: num(c.pm2_5),
      pm10: num(c.pm10),
      dust: num(c.dust),
      uv: typeof c.uv_index === "number" ? Math.round(c.uv_index * 10) / 10 : 0,
      place,
    };
  } catch {
    return null;
  }
}
