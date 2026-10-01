import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, shade, space, tracking, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { Icon, IconName } from "../../ui/Icon";

export function FeedCard({
  title,
  right,
  children,
  onPressTitle,
  half,
  icon,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Drawn icon shown before the title, replacing the emoji the labels used to
   * carry. Optional so a card without one still renders. */
  icon?: IconName;
  /** Makes the card's header open the matching full list. A chevron is shown so
   * it's discoverable — an invisible tap target isn't a feature. */
  onPressTitle?: () => void;
  /** Renders at half width inside a paired row (see TodayScreen). Drops the
   * card's own horizontal margin so the row can own the spacing. */
  half?: boolean;
}) {
  const { theme } = useTheme();
  const { chromeRtl } = useI18n();
  const Head: any = onPressTitle ? Pressable : View;
  return (
    <View
      style={[
        styles.card,
        half && styles.cardHalf,
        shade(theme, "sm"),
        { backgroundColor: theme.surface, borderColor: theme.line },
      ]}
    >
      <Head
        style={({ pressed }: { pressed?: boolean }) => [styles.head, pressed && styles.headPressed]}
        onPress={onPressTitle}
        accessibilityRole={onPressTitle ? "button" : undefined}
      >
        <View style={styles.titleWrap}>
          {icon && <Icon name={icon} size={15} color={theme.muted} />}
          {/* Uppercase and tracked, at the smallest step. A card title is a
              label for what follows, not a heading competing with it — setting
              it small and quiet lets the card's actual content carry the
              weight, which is the whole trick to a feed that looks calm. */}
          <Text style={[styles.title, { color: theme.muted }]}>{title.toUpperCase()}</Text>
        </View>
        <View style={styles.rightWrap}>
          {right}
          {onPressTitle && <Icon name="chevron" size={14} color={theme.muted} flip={chromeRtl} />}
        </View>
      </Head>
      <View>{children}</View>
    </View>
  );
}

export function FeedMuted({ text }: { text: string }) {
  const { theme } = useTheme();
  // Not italic. Faux-italic is what the system font falls back to here for
  // Arabic and Kurdish — the script has no italic form, so it gets slanted
  // mechanically and looks broken. Weight and colour carry the "this is a
  // placeholder, not content" signal in every script instead.
  return <Text style={{ color: theme.muted, fontSize: type.base }}>{text}</Text>;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    paddingHorizontal: space.lg,
    marginHorizontal: space.md,
    marginBottom: space.md,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.sm },
  // Pressable headers get a touch of feedback. Without it a tappable card head
  // is indistinguishable from a dead one until something navigates.
  headPressed: { opacity: 0.6 },
  cardHalf: { flex: 1, marginHorizontal: 0, marginBottom: 0, paddingHorizontal: space.md },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  rightWrap: { flexDirection: "row", alignItems: "center", gap: space.xs + 2 },
  title: { fontWeight: weight.semibold, fontSize: type.xs, letterSpacing: tracking.wide },
});
