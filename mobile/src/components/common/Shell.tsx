import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { Header } from "./Header";
import { SettingsSheet } from "../sheets/SettingsSheet";
import { EventDetailSheet } from "../sheets/EventDetailSheet";
import { DiwanSheet } from "../sheets/DiwanSheet";
import { DiwanEntrySheet } from "../sheets/DiwanEntrySheet";
import { DebtSheet } from "../sheets/DebtSheet";
import { DebtEntrySheet } from "../sheets/DebtEntrySheet";
import { WorkTasksSheet } from "../sheets/WorkTasksSheet";
import { WorkTaskEntrySheet } from "../sheets/WorkTaskEntrySheet";
import { ApprovalsSheet } from "../sheets/ApprovalsSheet";
import { ApprovalEntrySheet } from "../sheets/ApprovalEntrySheet";
import { NotificationsSheet } from "../sheets/NotificationsSheet";
import { WorkspaceSwitcherSheet } from "../sheets/WorkspaceSwitcherSheet";

export function Shell({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const { chromeRtl } = useI18n();
  return (
    // Arabic and Kurdish read right-to-left, so the layout mirrors — not just
    // the text. chromeRtl was computed from the start and consumed nowhere,
    // which left Arabic labels sitting in a left-to-right frame.
    <View style={[styles.root, { backgroundColor: theme.bg, direction: chromeRtl ? "rtl" : "ltr" }]}>
      <Header />
      <View style={styles.body}>{children}</View>
      <SettingsSheet />
      <EventDetailSheet />
      <DiwanSheet />
      <DiwanEntrySheet />
      <DebtSheet />
      <DebtEntrySheet />
      <WorkTasksSheet />
      <WorkTaskEntrySheet />
      <ApprovalsSheet />
      <ApprovalEntrySheet />
      <NotificationsSheet />
      <WorkspaceSwitcherSheet />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
});
