import * as Location from "expo-location";
import { DEFAULT_COORDS } from "../config";
import { getSavedCity } from "./prefs";

export interface Coords {
  latitude: number;
  longitude: number;
  usedDevice: boolean;
  /** Set only when the user picked a city, so cards can name it. */
  place?: string;
}

export async function getCoords(): Promise<Coords> {
  // An explicitly chosen city beats both the device and the Duhok fallback:
  // someone in Baghdad who declines the location prompt was otherwise stuck
  // with another city's weather, air quality and prayer times.
  const saved = await getSavedCity();
  if (saved) {
    return { latitude: saved.latitude, longitude: saved.longitude, usedDevice: false, place: saved.name };
  }
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") throw new Error("denied");
    const pos = await Location.getCurrentPositionAsync({});
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, usedDevice: true };
  } catch {
    return { ...DEFAULT_COORDS, usedDevice: false };
  }
}
