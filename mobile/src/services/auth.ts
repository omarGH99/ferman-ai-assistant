import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../config";

// The JWT is kept in AsyncStorage. On a native build this could be upgraded to
// expo-secure-store (Keychain/Keystore); AsyncStorage keeps things dependency-
// free and identical across web + native, which is fine for this app's tokens.
const TOKEN_KEY = "auth_token";

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  consent_data_collection: boolean;
}

export async function getToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function saveToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request(path: string, options: RequestInit = {}, token?: string | null) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  let data: any = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON response */
  }
  if (!r.ok) {
    const msg = (data && data.detail) || `Request failed (${r.status})`;
    throw new Error(typeof msg === "string" ? msg : "Request failed");
  }
  return data;
}

export async function signup(username: string, email: string, password: string):
  Promise<{ token: string; user: AuthUser }> {
  return request("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export async function login(loginId: string, password: string):
  Promise<{ token: string; user: AuthUser }> {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login: loginId, password }),
  });
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const data = await request("/auth/me", { method: "GET" }, token);
  return data.user;
}

export async function setConsentApi(token: string, consent: boolean): Promise<AuthUser> {
  const data = await request("/auth/consent", {
    method: "PATCH",
    body: JSON.stringify({ consent }),
  }, token);
  return data.user;
}

export async function changeUsernameApi(token: string, username: string): Promise<AuthUser> {
  const data = await request("/auth/username", {
    method: "PATCH",
    body: JSON.stringify({ username }),
  }, token);
  return data.user;
}

export async function changePasswordApi(
  token: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await request("/auth/password", {
    method: "PATCH",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  }, token);
}

export interface CollectPayload {
  text: string;
  lang?: string;
  intent?: string | null;
  confidence?: number | null;
  corrected_intent?: string | null;
}

// Fire-and-forget: the server drops the row unless the user has consented, so a
// failure here must never disrupt the chat. Resolves to the stored row's id
// when one was written, so a later correction can be attached to that same row.
export async function collect(
  token: string,
  payload: CollectPayload
): Promise<number | null> {
  try {
    const r = await request("/collect", { method: "POST", body: JSON.stringify(payload) }, token);
    return r?.id ?? null;
  } catch {
    return null;
  }
}

/** Attach a tap-to-correct label to a command already logged by collect(). */
export async function correctCommand(
  token: string,
  commandId: number,
  correctedIntent: string
): Promise<void> {
  try {
    await request(
      `/collect/${commandId}`,
      { method: "PATCH", body: JSON.stringify({ corrected_intent: correctedIntent }) },
      token
    );
  } catch {
    /* ignore — a lost correction must never disrupt the chat */
  }
}

// ---------------- sharing ----------------
export type ShareKind = "tasks" | "reminders" | "shopping";

export interface SharedBundle {
  code: string;
  from: string;
  kind: ShareKind;
  items: any[];
}

/** Store a bundle server-side and get back the code to hand to someone. */
export async function createShare(
  token: string,
  kind: ShareKind,
  items: any[]
): Promise<{ code: string; expires_days: number }> {
  return request("/share", { method: "POST", body: JSON.stringify({ kind, items }) }, token);
}

/** Look up a bundle by code. Throws with the server's message when the code is
 * unknown or expired, which is the common case worth showing the user. */
export async function fetchShare(token: string, code: string): Promise<SharedBundle> {
  return request(`/share/${encodeURIComponent(code.trim().toUpperCase())}`, {}, token);
}

// ---------------- cross-device state sync ----------------
export interface RemoteState {
  state: any | null;
  updated_at: string | null;
}

export async function getStateApi(token: string): Promise<RemoteState> {
  return request("/state", { method: "GET" }, token);
}

export async function putStateApi(token: string, state: any, updatedAt: number): Promise<void> {
  await request(
    "/state",
    { method: "PUT", body: JSON.stringify({ state, updated_at: String(updatedAt) }) },
    token
  );
}

// ---------------- tester feedback ----------------
export async function sendFeedback(
  token: string | null,
  message: string,
  rating?: number | null
): Promise<void> {
  await request(
    "/feedback",
    { method: "POST", body: JSON.stringify({ message, rating: rating ?? null }) },
    token || undefined
  );
}
