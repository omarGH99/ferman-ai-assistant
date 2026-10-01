import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeProvider";
import { useI18n } from "../i18n/I18nProvider";
import { Icon } from "../ui/Icon";
import { useAuth } from "../state/AuthProvider";
import {
  ALL_WIDGETS,
  DEFAULT_ON,
  WIDGET_META,
  WidgetKey,
  useWidgetPrefs,
} from "../state/WidgetPrefsProvider";

export function OnboardingScreen() {
  const { theme } = useTheme();
  const { t, chromeRtl } = useI18n();
  const { completeOnboarding } = useWidgetPrefs();
  const { updateConsent } = useAuth();
  const insets = useSafeAreaInsets();

  const [selected, setSelected] = useState<Set<WidgetKey>>(new Set(DEFAULT_ON));
  // Deliberately starts off. Consent has to be an actual choice, not something
  // pre-ticked that the user scrolls past — a pre-ticked box isn't consent.
  // Asking here rather than only in Settings is the point: before this, the
  // toggle was buried and almost nobody found it, so almost nothing was ever
  // collected.
  const [consent, setConsent] = useState(false);

  async function finish() {
    // Set consent before completing onboarding: completing it unmounts this
    // screen, and a pending request would be lost.
    if (consent) {
      try {
        await updateConsent(true);
      } catch {
        /* the user can still turn it on later in Settings */
      }
    }
    completeOnboarding(Array.from(selected));
  }

  const toggle = (k: WidgetKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, direction: chromeRtl ? "rtl" : "ltr", paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.brand, { color: theme.accent }]}>Ferman</Text>
        <Text style={[styles.title, { color: theme.text }]}>{t("ob_title")}</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>{t("ob_subtitle")}</Text>

        {ALL_WIDGETS.map((k) => {
          const on = selected.has(k);
          return (
            <Pressable
              key={k}
              onPress={() => toggle(k)}
              style={[
                styles.row,
                { backgroundColor: theme.surface, borderColor: on ? theme.accent : theme.line },
              ]}
            >
              <Icon name={WIDGET_META[k].icon} size={19} color={on ? theme.accent : theme.muted} />
              <View style={{ flex: 1, paddingRight: 12, paddingLeft: 11 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
                  {t(WIDGET_META[k].labelKey)}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                  {t(WIDGET_META[k].descKey)}
                </Text>
              </View>
              <View
                style={[
                  styles.check,
                  {
                    backgroundColor: on ? theme.accent : "transparent",
                    borderColor: on ? theme.accent : theme.line,
                  },
                ]}
              >
                {on && <Text style={{ color: theme.accentInk, fontSize: 13, fontWeight: "800" }}>✓</Text>}
              </View>
            </Pressable>
          );
        })}
        <Text style={[styles.sectionHead, { color: theme.muted }]}>{t("s_data")}</Text>
        <View
          style={[
            styles.consent,
            { backgroundColor: theme.surface, borderColor: consent ? theme.accent : theme.line },
          ]}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
              {t("collect_label")}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
              {t("collect_hint")}
            </Text>
          </View>
          <Switch value={consent} onValueChange={setConsent} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.bg, borderTopColor: theme.line, paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={[styles.doneBtn, { backgroundColor: theme.accent }]} onPress={finish}>
          <Text style={{ color: theme.accentInk, fontSize: 15, fontWeight: "700" }}>
            {t("ob_done")} · {selected.size} {t("ob_selected")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 24 },
  brand: { fontSize: 26, fontWeight: "800", textAlign: "center", marginTop: 8 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center", marginTop: 12 },
  subtitle: { fontSize: 13, textAlign: "center", marginTop: 6, marginBottom: 18, lineHeight: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  check: { width: 26, height: 26, borderRadius: 12, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  sectionHead: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 18, marginBottom: 8 },
  consent: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  footer: { padding: 16, borderTopWidth: 1 },
  doneBtn: { borderRadius: 12, paddingVertical: 15, alignItems: "center" },
});
