import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { isRtlText } from "../../i18n/I18nProvider";

export function UserBubble({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.bubble, { backgroundColor: theme.user }]}>
        <Text style={{ color: theme.userInk, fontSize: 15, writingDirection: isRtlText(text) ? "rtl" : "ltr" }}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-end", maxWidth: "86%", marginBottom: 12 },
  bubble: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 16, borderBottomRightRadius: 5 },
});
