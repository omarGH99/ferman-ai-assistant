import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastContextValue {
  /** An action turns the toast into an undo prompt: it becomes tappable and
   * stays up longer. Preferred over a confirm dialog — asking "are you sure?"
   * before every delete taxes the common case to protect the rare one. */
  showToast: (message: string, action?: ToastAction) => void;
}

const PLAIN_MS = 1800;
const ACTION_MS = 5000; // long enough to notice, read and reach

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<ToastAction | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { theme } = useTheme();

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(
      ({ finished }) => {
        if (finished) setAction(null);
      }
    );
  }, [opacity]);

  const showToast = useCallback(
    (msg: string, act?: ToastAction) => {
      setMessage(msg);
      setAction(act || null);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, act ? ACTION_MS : PLAIN_MS);
    },
    [opacity, hide]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Animated.View
        // Only intercept touches when there is something to tap, otherwise the
        // toast swallows presses on whatever sits beneath it.
        pointerEvents={action ? "box-none" : "none"}
        style={[styles.toast, { opacity, backgroundColor: theme.text }]}
      >
        <View style={styles.row}>
          <Text style={[styles.text, { color: theme.bg }]}>{message}</Text>
          {action && (
            <Pressable
              onPress={() => {
                if (timer.current) clearTimeout(timer.current);
                action.onPress();
                hide();
              }}
              hitSlop={14}
            >
              <Text style={[styles.action, { color: theme.bg }]}>{action.label}</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: "10%",
    right: "10%",
    bottom: 96,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 16,
    zIndex: 50,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16 },
  text: { fontSize: 13, textAlign: "center", flexShrink: 1 },
  action: { fontSize: 13, fontWeight: "800", textDecorationLine: "underline" },
});
