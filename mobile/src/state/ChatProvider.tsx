import React, { createContext, useContext, useState } from "react";
import { Recur, Slots } from "./types";

export interface ReminderCardData {
  status: "pending" | "saved" | "cancelled";
  kind: "reminder" | "alarm";
  title: string;
  date: string | null; // ISO date
  time: string;
  recur: Recur | null;
  note: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "bot";
  text: string;
  isAction?: boolean;
  intent?: string | null;
  slots?: Slots;
  confidence?: number | null;
  candidates?: string[];
  sourceText?: string;
  note?: string;
  translated?: string | null;
  ask?: boolean;
  card?: ReminderCardData;
  /** Row id returned by /collect, so a tap-to-correct can be attached to the
   * command this reply answered. Null when nothing was stored (no consent). */
  collectId?: number | null;
  /** Intent the user picked from the candidates row; hides the row once set. */
  corrected?: string;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

interface ChatContextValue {
  messages: ChatMessage[];
  addUser: (text: string) => void;
  addBot: (msg: Omit<ChatMessage, "id" | "role">) => string;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  clearChat: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const addUser = (text: string) => {
    setMessages((m) => [...m, { id: uid(), role: "user", text }]);
  };
  const addBot = (msg: Omit<ChatMessage, "id" | "role">) => {
    const id = uid();
    setMessages((m) => [...m, { id, role: "bot", ...msg }]);
    return id;
  };
  const updateMessage = (id: string, patch: Partial<ChatMessage>) => {
    setMessages((m) => m.map((msg) => (msg.id === id ? { ...msg, ...patch } : msg)));
  };
  const clearChat = () => setMessages([]);

  return (
    <ChatContext.Provider value={{ messages, addUser, addBot, updateMessage, clearChat }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
