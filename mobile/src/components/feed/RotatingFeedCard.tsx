import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { FeedCard, FeedMuted } from "./FeedCard";
import type { IconName } from "../../ui/Icon";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";

export const ROTATE_MS = 5000;

/** A feed card that shows one item at a time and cross-fades to the next every
 * 5 s, instead of listing everything at once. Tapping opens a sheet with the
 * full list.
 *
 * Two details that matter for it not looking broken:
 *  - the rotating area has a fixed height, because items differ in length and
 *    the card would otherwise resize under the user's thumb every 5 s;
 *  - rotation stops while the sheet is open, so reading the full list doesn't
 *    fight with the timer.
 */
export function RotatingFeedCard<T>({
  title,
  right,
  items,
  loading,
  emptyText,
  renderItem,
  keyExtractor,
  itemHeight = 56,
  sheetContent,
  onOpen,
  seeAllCount,
  icon,
  half,
}: {
  title: string;
  right?: React.ReactNode;
  items: T[] | null;
  loading?: boolean;
  emptyText: string;
  /** `compact` is the rotating single-item view; the sheet renders the same
   * item without the height limit. */
  renderItem: (item: T, compact: boolean) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  itemHeight?: number;
  /** Replaces the default "list every item" sheet body — used where the expanded
   * view is a different shape from the rotating one (crypto shows a top-10
   * table, not the two coins it rotates). */
  sheetContent?: React.ReactNode;
  /** Fired when the sheet opens, so a custom body can load lazily instead of on
   * every feed render. */
  onOpen?: () => void;
  /** Overrides the "See all (n)" count, e.g. when the sheet shows more than the
   * rotating list holds. */
  seeAllCount?: number;
  icon?: IconName;
  half?: boolean;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const fade = useRef(new Animated.Value(1)).current;

  const count = items ? items.length : 0;

  // A refresh can return fewer items than before; don't strand the index past
  // the end of the new list.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (open || count < 2) return;
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }).start(
        ({ finished }) => {
          if (!finished) return;
          setIndex((i) => (i + 1) % count);
          Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
        }
      );
    }, ROTATE_MS);
    return () => {
      clearInterval(id);
      fade.setValue(1); // never leave the card stuck mid-fade
    };
  }, [open, count, fade]);

  const current = items && count ? items[Math.min(index, count - 1)] : null;

  return (
    <>
      <FeedCard title={title} right={right} icon={icon} half={half}>
        {loading ? (
          <FeedMuted text={t("f_loading")} />
        ) : !current ? (
          <FeedMuted text={emptyText} />
        ) : (
          <Pressable
            onPress={() => {
              onOpen?.();
              setOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${title} — ${t("w_see_all")}`}
          >
            <Animated.View style={{ height: itemHeight, opacity: fade, justifyContent: "center" }}>
              {renderItem(current, true)}
            </Animated.View>

            <View style={styles.footer}>
              <Dots count={count} index={index} />
              <Text style={[styles.seeAll, { color: theme.accent }]}>
                {t("w_see_all")} ({seeAllCount ?? count})
              </Text>
            </View>
          </Pressable>
        )}
      </FeedCard>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={title}>
        {sheetContent ??
          (items || []).map((item, i) => (
          <View
            key={keyExtractor(item, i)}
            style={[
              styles.sheetRow,
              { borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.line },
            ]}
          >
              {renderItem(item, false)}
            </View>
          ))}
      </BottomSheet>
    </>
  );
}

/** Position indicator. Dots stop being readable past a handful of items, so
 * longer lists get a plain counter instead. */
function Dots({ count, index }: { count: number; index: number }) {
  const { theme } = useTheme();
  if (count < 2) return <View />;
  if (count > 6) {
    return (
      <Text style={{ color: theme.muted, fontSize: 11 }}>
        {index + 1} / {count}
      </Text>
    );
  }
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i === index ? theme.accent : theme.line },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  dots: { flexDirection: "row", gap: 5, alignItems: "center" },
  dot: { width: 6, height: 6, borderRadius: 8 },
  seeAll: { fontSize: 12, fontWeight: "700" },
  sheetRow: { paddingVertical: 11 },
});
