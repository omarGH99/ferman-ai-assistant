import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";

export function WelcomeChips() {
  const { theme } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.text }]}>{t("help_title")}</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>{t("help_sub")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  sub: { fontSize: 13, marginBottom: 18, textAlign: "center" },
});
