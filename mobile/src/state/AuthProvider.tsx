import React, { createContext, useContext, useEffect, useState } from "react";
import {
  AuthUser,
  changePasswordApi,
  changeUsernameApi,
  clearToken,
  fetchMe,
  getToken,
  login as loginApi,
  saveToken,
  setConsentApi,
  signup as signupApi,
} from "../services/auth";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean; // true only during the initial stored-token check
  signIn: (loginId: string, password: string) => Promise<void>;
  signUp: (username: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateConsent: (consent: boolean) => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // On launch, validate any stored token against the server.
  useEffect(() => {
    (async () => {
      const stored = await getToken();
      if (!stored) {
        setLoading(false);
        return;
      }
      try {
        const me = await fetchMe(stored);
        setUser(me);
        setToken(stored);
      } catch {
        await clearToken(); // expired / invalid / server changed
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function signIn(loginId: string, password: string) {
    const { token: tok, user: u } = await loginApi(loginId, password);
    await saveToken(tok);
    setToken(tok);
    setUser(u);
  }

  async function signUp(username: string, email: string, password: string) {
    const { token: tok, user: u } = await signupApi(username, email, password);
    await saveToken(tok);
    setToken(tok);
    setUser(u);
  }

  async function signOut() {
    await clearToken();
    setToken(null);
    setUser(null);
  }

  async function updateConsent(consent: boolean) {
    if (!token) return;
    const updated = await setConsentApi(token, consent);
    setUser(updated);
  }

  async function updateUsername(username: string) {
    if (!token) return;
    const updated = await changeUsernameApi(token, username);
    setUser(updated);
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    if (!token) return;
    await changePasswordApi(token, currentPassword, newPassword);
  }

  return (
    <AuthContext.Provider
      value={{ user, token, loading, signIn, signUp, signOut, updateConsent, updateUsername, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
