import React from "react";
import { Pressable, Text, View } from "react-native";
import { FeedCard, FeedMuted } from "./FeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { isRtlText } from "../../i18n/I18nProvider";
import { useAppState } from "../../state/StateProvider";
import { useSheets } from "../../ui/SheetsProvider";

export function ShoppingCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const st = useAppState();
  const { openLists } = useSheets();

  const items = st.shopping
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.checked)
    .slice(0, 6);

  return (
    <FeedCard half={half}
      title={t("f_shopping")} icon="shopping"
      onPressTitle={() => openLists("shopping")}
      right={items.length ? <Text style={{ color: theme.muted, fontSize: 11 }}>{items.length}</Text> : null}
    >
      {!items.length ? (
        <FeedMuted text={t("shopping_empty")} />
      ) : (
        items.map(({ item, index }, i) => (
          <View
            key={index}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              paddingVertical: 7,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: theme.line,
            }}
          >
            <Pressable
              style={{ width: 20, height: 20, borderRadius: 8, borderWidth: 2, borderColor: theme.line }}
              onPress={() => st.toggleShoppingChecked(index)}
              hitSlop={14}
            />
            <Text
              style={{ flex: 1, color: theme.text, fontSize: 13, writingDirection: isRtlText(item.name) ? "rtl" : "ltr" }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          </View>
        ))
      )}
    </FeedCard>
  );
}
