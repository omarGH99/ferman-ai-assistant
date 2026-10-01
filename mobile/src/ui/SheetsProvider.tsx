import React, { createContext, useContext, useMemo, useState } from "react";
import { goToTab } from "../navigation/navRef";
import type { DebtDirection, DiwanDirection } from "../services/workspace";

type SheetName =
  | "settings" | "event" | "diwan" | "diwanEntry" | "debt" | "debtEntry"
  | "workTasks" | "workTaskEntry" | "approvals" | "approvalEntry" | "notifications"
  | "workspaceSwitcher" | null;
export type ListsTab = "tasks" | "reminders" | "alarms" | "shopping" | "contacts";

interface SheetsContextValue {
  activeSheet: SheetName;
  editingEventId: string | null;
  /** Which tab the lists sheet should show; feed cards set this so tapping
   * "Shopping" lands on the shopping list rather than always on tasks. */
  listsTab: ListsTab;
  openLists: (tab?: ListsTab) => void;
  setListsTab: (tab: ListsTab) => void;
  openSettings: () => void;
  openEvent: (id: string) => void;
  /** null editingDiwanId means "open the list"; a number opens that entry's
   * detail; openNewDiwanEntry opens the create form pre-set to a direction. */
  editingDiwanId: number | null;
  diwanCreateDirection: DiwanDirection;
  openDiwan: () => void;
  openDiwanEntry: (id: number) => void;
  /** replyToId set means "prefill this new entry as a reply to that one" —
   * the create form both links and shows what it's replying to. */
  diwanReplyToId: number | null;
  openNewDiwanEntry: (direction: DiwanDirection, replyToId?: number) => void;
  editingDebtId: number | null;
  debtCreateDirection: DebtDirection;
  openDebt: () => void;
  openDebtEntry: (id: number) => void;
  openNewDebtEntry: (direction: DebtDirection) => void;
  editingTaskId: number | null;
  openWorkTasks: () => void;
  openWorkTaskEntry: (id: number) => void;
  openNewWorkTask: () => void;
  editingApprovalId: number | null;
  openApprovals: () => void;
  openApprovalEntry: (id: number) => void;
  openNewApproval: () => void;
  openNotifications: () => void;
  openWorkspaceSwitcher: () => void;
  closeSheet: () => void;
  /** Share code the app was opened with (web `?s=CODE`), consumed once by the
   * receive panel. Null on native, which has no URL to read. */
  pendingShareCode: string | null;
  clearPendingShare: () => void;
}

/** Read `?s=CODE` once at startup and strip it from the address bar, so a
 * refresh doesn't re-trigger the prompt after the user has already decided. */
function readShareCodeFromUrl(): string | null {
  try {
    if (typeof window === "undefined" || !window.location?.search) return null;
    const code = new URLSearchParams(window.location.search).get("s");
    if (!code) return null;
    window.history?.replaceState?.({}, "", window.location.pathname);
    return code.trim().toUpperCase().slice(0, 8);
  } catch {
    return null;
  }
}

const SheetsContext = createContext<SheetsContextValue | null>(null);

export function SheetsProvider({ children }: { children: React.ReactNode }) {
  const [activeSheet, setActiveSheet] = useState<SheetName>(null);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editingDiwanId, setEditingDiwanId] = useState<number | null>(null);
  const [diwanCreateDirection, setDiwanCreateDirection] = useState<DiwanDirection>("incoming");
  const [diwanReplyToId, setDiwanReplyToId] = useState<number | null>(null);
  const [editingDebtId, setEditingDebtId] = useState<number | null>(null);
  const [debtCreateDirection, setDebtCreateDirection] = useState<DebtDirection>("they_owe_us");
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingApprovalId, setEditingApprovalId] = useState<number | null>(null);
  const [listsTab, setListsTab] = useState<ListsTab>("tasks");
  const [pendingShareCode, setPendingShareCode] = useState<string | null>(readShareCodeFromUrl);

  const value = useMemo<SheetsContextValue>(
    () => ({
      activeSheet,
      editingEventId,
      listsTab,
      setListsTab,
      // Lists is a tab now, so this navigates rather than opening a sheet. The
      // name is kept: every caller still means "take me to my lists".
      openLists: (tab?: ListsTab) => {
        if (tab) setListsTab(tab);
        goToTab("Lists");
      },
      openSettings: () => setActiveSheet("settings"),
      openEvent: (id: string) => {
        setEditingEventId(id);
        setActiveSheet("event");
      },
      editingDiwanId,
      diwanCreateDirection,
      openDiwan: () => setActiveSheet("diwan"),
      openDiwanEntry: (id: number) => {
        setEditingDiwanId(id);
        setActiveSheet("diwanEntry");
      },
      diwanReplyToId,
      openNewDiwanEntry: (direction: DiwanDirection, replyToId?: number) => {
        setEditingDiwanId(null);
        setDiwanCreateDirection(direction);
        setDiwanReplyToId(replyToId ?? null);
        setActiveSheet("diwanEntry");
      },
      editingDebtId,
      debtCreateDirection,
      openDebt: () => setActiveSheet("debt"),
      openDebtEntry: (id: number) => {
        setEditingDebtId(id);
        setActiveSheet("debtEntry");
      },
      openNewDebtEntry: (direction: DebtDirection) => {
        setEditingDebtId(null);
        setDebtCreateDirection(direction);
        setActiveSheet("debtEntry");
      },
      editingTaskId,
      openWorkTasks: () => setActiveSheet("workTasks"),
      openWorkTaskEntry: (id: number) => {
        setEditingTaskId(id);
        setActiveSheet("workTaskEntry");
      },
      openNewWorkTask: () => {
        setEditingTaskId(null);
        setActiveSheet("workTaskEntry");
      },
      editingApprovalId,
      openApprovals: () => setActiveSheet("approvals"),
      openApprovalEntry: (id: number) => {
        setEditingApprovalId(id);
        setActiveSheet("approvalEntry");
      },
      openNewApproval: () => {
        setEditingApprovalId(null);
        setActiveSheet("approvalEntry");
      },
      openNotifications: () => setActiveSheet("notifications"),
      openWorkspaceSwitcher: () => setActiveSheet("workspaceSwitcher"),
      closeSheet: () => setActiveSheet(null),
      pendingShareCode,
      clearPendingShare: () => setPendingShareCode(null),
    }),
    [
      activeSheet, editingEventId, editingDiwanId, diwanCreateDirection, diwanReplyToId,
      editingDebtId, debtCreateDirection, editingTaskId, editingApprovalId,
      listsTab, pendingShareCode,
    ]
  );

  return <SheetsContext.Provider value={value}>{children}</SheetsContext.Provider>;
}

export function useSheets() {
  const ctx = useContext(SheetsContext);
  if (!ctx) throw new Error("useSheets must be used within SheetsProvider");
  return ctx;
}
