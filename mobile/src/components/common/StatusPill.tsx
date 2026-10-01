import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { STATUS_LABEL_KEYS } from "../../i18n/strings";
import { Status } from "../../state/types";
import { Theme } from "../../theme/themes";

const STATUS_COLORS: Record<Status, (theme: Theme) => { bg: string; fg: string }> = {
  pending: (theme) => ({ bg: theme.chip, fg: theme.muted }),
  inprogress: (theme) => ({ bg: theme.soft, fg: theme.accent }),
  done: (theme) => ({ bg: theme.soft, fg: theme.accent }),
  attended: (theme) => ({ bg: theme.chip, fg: theme.text }),
};

export function StatusPill({ status }: { status: Status }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { bg, fg } = STATUS_COLORS[status](theme);
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{t(STATUS_LABEL_KEYS[status])}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7 },
  text: { fontSize: 11 },
});
