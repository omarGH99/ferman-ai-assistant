import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FeedCard } from "./FeedCard";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { useAppState } from "../../state/StateProvider";

const BOTTLE_H = 96;
const ADD_STEPS = [250, 500];

export function WaterCard({ half }: { half?: boolean } = {}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { water, addWater, setWaterGoal } = useAppState();

  const pct = water.goalMl > 0 ? Math.min(1, water.ml / water.goalMl) : 0;
  const done = water.ml >= water.goalMl;

  return (
    <FeedCard half={half}
      title={t("f_water")} icon="water"
      right={
        <Text style={{ color: theme.muted, fontSize: 11 }}>{Math.round(pct * 100)}%</Text>
      }
    >
      <View style={styles.row}>
        {/* Bottle drawn with plain Views — a fill height and a border. Bringing in
            react-native-svg for one rounded rectangle isn't worth the dependency. */}
        <View style={[styles.bottle, { borderColor: theme.line, backgroundColor: theme.bg }]}>
          <View
            style={[
              styles.fill,
              {
                height: BOTTLE_H * pct,
                backgroundColor: done ? theme.accent : theme.soft,
              },
            ]}
          />
          <Text style={[styles.bottleCap, { backgroundColor: theme.line }]} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={[styles.amount, { color: done ? theme.accent : theme.text }]}>
            {water.ml.toLocaleString()}
            <Text style={{ color: theme.muted, fontSize: 15, fontWeight: "400" }}>
              {" "}
              / {water.goalMl.toLocaleString()} ml
            </Text>
          </Text>

          <View style={styles.buttons}>
            {ADD_STEPS.map((step) => (
              <Pressable
                key={step}
                onPress={() => addWater(step)}
                style={[styles.btn, { backgroundColor: theme.accent }]}
                accessibilityRole="button"
              >
                <Text style={{ color: theme.accentInk, fontWeight: "700", fontSize: 13 }}>
                  +{step}
                </Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => addWater(-250)}
              disabled={water.ml <= 0}
              style={[
                styles.btn,
                {
                  backgroundColor: theme.chip,
                  borderWidth: 1,
                  borderColor: theme.line,
                  opacity: water.ml <= 0 ? 0.4 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("water_undo")}
            >
              <Text style={{ color: theme.text, fontSize: 13 }}>−250</Text>
            </Pressable>
          </View>

          <View style={styles.goalRow}>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{t("water_goal")}</Text>
            <Pressable
              onPress={() => setWaterGoal(water.goalMl - 250)}
              style={[styles.goalBtn, { borderColor: theme.line }]}
              hitSlop={10}
            >
              <Text style={{ color: theme.muted, fontSize: 13 }}>−</Text>
            </Pressable>
            <Pressable
              onPress={() => setWaterGoal(water.goalMl + 250)}
              style={[styles.goalBtn, { borderColor: theme.line }]}
              hitSlop={10}
            >
              <Text style={{ color: theme.muted, fontSize: 13 }}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </FeedCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  bottle: {
    width: 46,
    height: BOTTLE_H,
    borderWidth: 2,
    borderRadius: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  fill: { width: "100%" },
  bottleCap: { position: "absolute", top: 0, left: 13, right: 13, height: 5, borderRadius: 8 },
  amount: { fontSize: 22, fontWeight: "700" },
  buttons: { flexDirection: "row", gap: 7, marginTop: 9, flexWrap: "wrap" },
  btn: { borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  goalBtn: {
    borderWidth: 1,
    borderRadius: 8,
    width: 26,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
