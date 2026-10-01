import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthProvider";
import { Workspace, createWorkspaceApi, joinWorkspaceApi, listWorkspacesApi } from "../services/workspace";

export type FeedMode = "personal" | "work";

// Same pattern as I18nProvider's uiLang: read once on mount, write on change,
// swallow storage errors rather than surface them — losing the remembered
// mode is a minor annoyance, not something worth an error path over.
const MODE_KEY = "workMode";
const WORKSPACE_KEY = "activeWorkspaceId";

interface WorkspaceContextValue {
  mode: FeedMode;
  setMode: (m: FeedMode) => void;
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  setActiveWorkspaceId: (id: number) => void;
  loading: boolean;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
  joinWorkspace: (code: string) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [mode, setModeState] = useState<FeedMode>("personal");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The id read back from storage before the workspace list has loaded —
  // applied once the list arrives, and only if it still refers to a
  // workspace the user is actually in (an account tested with, then
  // abandoned, shouldn't leave a dangling reference).
  const pendingRestoreId = useRef<number | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const list = await listWorkspacesApi(token);
      setWorkspaces(list);
      setLoaded(true);
      setActiveWorkspaceId((cur) => {
        const want = cur ?? pendingRestoreId.current;
        pendingRestoreId.current = null;
        return want && list.some((w) => w.id === want) ? want : list[0]?.id ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Fetched lazily on first switch to Work, not at app startup — most
  // sessions never touch office mode, and there is no reason to spend every
  // user a request whose result they'll never see. The actual fetch is owned
  // by the reactive effect below, which also covers the restore-on-mount path.
  const setMode = useCallback((m: FeedMode) => setModeState(m), []);

  // Restore once on mount — read-only, no fetch here. WorkspaceProvider
  // mounts before AuthProvider's stored token has necessarily resolved (it
  // validates asynchronously), so a fetch fired at this instant could run
  // with token still null and silently do nothing. The effect below owns the
  // actual fetch, reactively, so it fires once the token is really there.
  useEffect(() => {
    (async () => {
      const [savedMode, savedWs] = await Promise.all([
        AsyncStorage.getItem(MODE_KEY),
        AsyncStorage.getItem(WORKSPACE_KEY),
      ]).catch(() => [null, null]);
      if (savedWs) pendingRestoreId.current = Number(savedWs) || null;
      if (savedMode === "work") setModeState("work");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Covers both paths into Work mode: the interactive toggle (setMode below)
  // and a restored "work" mode arriving before the token does. Re-runs when
  // token flips from null to real, which is what makes the restore-before-
  // login-resolves case work instead of fetching once against a null token.
  useEffect(() => {
    if (mode === "work" && token && !loaded) refreshWorkspaces();
  }, [mode, token, loaded, refreshWorkspaces]);

  useEffect(() => {
    AsyncStorage.setItem(MODE_KEY, mode).catch(() => {});
  }, [mode]);

  useEffect(() => {
    if (activeWorkspaceId == null) return;
    AsyncStorage.setItem(WORKSPACE_KEY, String(activeWorkspaceId)).catch(() => {});
  }, [activeWorkspaceId]);

  const createWorkspace = useCallback(
    async (name: string) => {
      if (!token) throw new Error("Not signed in.");
      const w = await createWorkspaceApi(token, name);
      setWorkspaces((prev) => [...prev, w]);
      setActiveWorkspaceId(w.id);
      setLoaded(true);
      return w;
    },
    [token]
  );

  const joinWorkspace = useCallback(
    async (code: string) => {
      if (!token) throw new Error("Not signed in.");
      const w = await joinWorkspaceApi(token, code);
      setWorkspaces((prev) => (prev.some((x) => x.id === w.id) ? prev : [...prev, w]));
      setActiveWorkspaceId(w.id);
      setLoaded(true);
      return w;
    },
    [token]
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) || null;

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      mode,
      setMode,
      workspaces,
      activeWorkspace,
      setActiveWorkspaceId,
      loading,
      refreshWorkspaces,
      createWorkspace,
      joinWorkspace,
    }),
    [mode, setMode, workspaces, activeWorkspace, loading, refreshWorkspaces, createWorkspace, joinWorkspace]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
