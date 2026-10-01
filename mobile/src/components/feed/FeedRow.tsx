import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export function FeedRow({
  time,
  text,
  rtl,
  onPress,
  right,
  highlighted,
  first,
}: {
  time: string;
  text: string;
  rtl?: boolean;
  onPress?: () => void;
  right?: React.ReactNode;
  highlighted?: boolean;
  first?: boolean;
}) {
  const { theme } = useTheme();
  const Wrapper: any = onPress ? Pressable : View;
  return (
    <Wrapper
      style={[
        styles.row,
        !first && { borderTopWidth: 1, borderTopColor: theme.line },
        highlighted && { backgroundColor: theme.soft, borderRadius: 8, paddingHorizontal: 6 },
      ]}
      onPress={onPress}
    >
      <Text style={[styles.time, { color: theme.accent }]}>{time}</Text>
      <Text
        style={[styles.text, { color: theme.text, writingDirection: rtl ? "rtl" : "ltr" }]}
        numberOfLines={1}
      >
        {text}
      </Text>
      {right}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 7 },
  time: { fontWeight: "700", fontSize: 12, minWidth: 48 },
  text: { flex: 1, fontSize: 13 },
});
