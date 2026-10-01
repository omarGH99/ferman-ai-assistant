import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { useI18n } from "../i18n/I18nProvider";
import { Icon, IconName } from "../ui/Icon";
import { TodayScreen } from "../screens/TodayScreen";
import { ListsScreen } from "../screens/ListsScreen";
import { AssistantScreen } from "../screens/AssistantScreen";
import { CalendarScreen } from "../screens/CalendarScreen";

const Tab = createBottomTabNavigator();

// Lists were behind a header icon while the calendar had a whole tab — the
// wrong way round, since the lists hold the app's actual content and get opened
// far more often.
const ICONS: Record<string, IconName> = {
  Today: "home",
  Lists: "tasks",
  Assistant: "chat",
  Calendar: "calendar",
};

export function RootNavigator() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        // Explicit height: on web there is no bottom inset and the default bar
        // clipped the labels. insets.bottom keeps phones with a home indicator right.
        tabBarStyle: {
          backgroundColor: theme.header,
          borderTopColor: theme.line,
          height: 74 + insets.bottom,
          paddingTop: 6,
          paddingBottom: 10 + insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 15 },
        tabBarIcon: ({ color }) => <Icon name={ICONS[route.name]} size={21} color={color} />,
      })}
    >
      <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarLabel: t("today") }} />
      <Tab.Screen name="Lists" component={ListsScreen} options={{ tabBarLabel: t("my_lists") }} />
      <Tab.Screen name="Assistant" component={AssistantScreen} options={{ tabBarLabel: t("assistant") }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarLabel: t("calendar") }} />
    </Tab.Navigator>
  );
}
