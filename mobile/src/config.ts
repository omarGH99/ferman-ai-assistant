// Point this at the machine running `uvicorn main:app`. On a physical device
// or a phone-based Expo Go session, "localhost" means the phone itself, so
// use your computer's LAN IP (e.g. http://192.168.1.23:7860) instead.
//
// In a browser (web export served by main.py itself), default to a relative
// base so requests always target whatever origin served the page — an empty
// EXPO_PUBLIC_API_BASE_URL doesn't reliably survive Expo's env-var inlining,
// so this can't just rely on that env var alone for the web build.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  (typeof window !== "undefined" ? "" : "http://localhost:7860");

export const DEFAULT_COORDS = { latitude: 36.87, longitude: 42.99 };
export const DEFAULT_PLACE = "Duhok";
