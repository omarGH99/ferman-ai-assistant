import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { BRAND_QUOTE } from "./src/brand";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";
import { I18nProvider } from "./src/i18n/I18nProvider";
import { AuthProvider, useAuth } from "./src/state/AuthProvider";
import { WorkspaceProvider } from "./src/state/WorkspaceProvider";
import { StateProvider } from "./src/state/StateProvider";
import { WidgetPrefsProvider, useWidgetPrefs } from "./src/state/WidgetPrefsProvider";
import { ChatProvider } from "./src/state/ChatProvider";
import { HolidaysProvider } from "./src/state/HolidaysProvider";
import { ToastProvider } from "./src/ui/ToastProvider";
import { SheetsProvider } from "./src/ui/SheetsProvider";
import { Shell } from "./src/components/common/Shell";
import { ReminderWatcher } from "./src/components/common/ReminderWatcher";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { navRef } from "./src/navigation/navRef";
import { warmUp } from "./src/services/api";
import { useSheets } from "./src/ui/SheetsProvider";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";

function AppContent() {
  const { theme, themeName } = useTheme();
  const { user, loading } = useAuth();
  const { ready: widgetsReady, onboarded } = useWidgetPrefs();

  // The backend scales to zero, so start waking it the moment the app opens.
  // By the time the user has logged in or read the feed, the container is
  // usually up and the first real request no longer eats the ~15-30 s boot.
  useEffect(() => {
    warmUp();
  }, []);

  // Opened from a share link: jump straight to the list sheet so the preview
  // appears without the recipient hunting for "Have a code?".
  const { openLists, pendingShareCode } = useSheets();
  useEffect(() => {
    if (pendingShareCode && user && onboarded) openLists();
  }, [pendingShareCode, user, onboarded]);

  const navTheme = {
    ...DefaultTheme,
    dark: themeName === "dark",
    colors: {
      ...DefaultTheme.colors,
      background: theme.bg,
      card: theme.header,
      text: theme.text,
      border: theme.line,
      primary: theme.accent,
    },
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg, padding: 32 }}>
        <StatusBar style={themeName === "dark" ? "light" : "dark"} />
        <Text style={{ fontSize: 34, fontWeight: "800", color: theme.accent, marginBottom: 20 }}>Ferman</Text>
        <ActivityIndicator color={theme.accent} size="large" />
        <Text
          style={{
            color: theme.muted,
            fontSize: 13,
            lineHeight: 20,
            fontStyle: "italic",
            textAlign: "center",
            marginTop: 24,
            maxWidth: 420,
          }}
        >
          {BRAND_QUOTE}
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <>
        <StatusBar style={themeName === "dark" ? "light" : "dark"} />
        <AuthScreen />
      </>
    );
  }

  if (!widgetsReady) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.bg }}>
        <StatusBar style={themeName === "dark" ? "light" : "dark"} />
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }

  if (!onboarded) {
    return (
      <>
        <StatusBar style={themeName === "dark" ? "light" : "dark"} />
        <OnboardingScreen />
      </>
    );
  }

  return (
    <NavigationContainer theme={navTheme} ref={navRef}>
      <StatusBar style={themeName === "dark" ? "light" : "dark"} />
      <ReminderWatcher />
      <Shell>
        <RootNavigator />
      </Shell>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <WorkspaceProvider>
            <StateProvider>
              <WidgetPrefsProvider>
                <HolidaysProvider>
                <ChatProvider>
                  <ToastProvider>
                    <SheetsProvider>
                      <AppContent />
                    </SheetsProvider>
                  </ToastProvider>
                </ChatProvider>
                </HolidaysProvider>
              </WidgetPrefsProvider>
            </StateProvider>
            </WorkspaceProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
