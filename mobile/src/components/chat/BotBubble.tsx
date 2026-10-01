import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n, isRtlText } from "../../i18n/I18nProvider";
import { ChatMessage } from "../../state/ChatProvider";
import { NONE_INTENT } from "../../utils/constants";

/** Intent ids are machine labels ("calendar_set"). Showing them raw is ugly but
 * translating 34 of them into three languages is a lot of surface for a tester-
 * facing affordance, so just make them readable. */
function humanizeIntent(id: string) {
  return id.replace(/_/g, " ");
}

/** What the model understood: intent, confidence, and the slots it pulled out.
 * Quiet by design — it is there for testers and for anyone judging the model,
 * not something a user needs to read. Shown under confident answers only
 * (plain replies and saved reminder/alarm cards), never under a question. */
export function ModelLine({ msg }: { msg: ChatMessage }) {
  const { theme } = useTheme();
  if (!(msg.isAction || msg.card) || !msg.intent || msg.confidence == null) return null;
  const slots = Object.entries(msg.slots || {})
    .slice(0, 3)
    .map(([k, v]) => `  ·  ${k}: ${v}`)
    .join("");
  return (
    <Text style={[styles.modelLine, { color: theme.muted }]} numberOfLines={2}>
      {humanizeIntent(msg.intent)} · {Math.round(msg.confidence * 100)}%
      {slots}
    </Text>
  );
}

export function BotBubble({
  msg,
  onCorrect,
}: {
  msg: ChatMessage;
  onCorrect?: (intent: string) => void;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();

  // Chips are open by default on `ask` messages — the intent was too uncertain
  // to act on, so the bubble's text is the question and the chips are its
  // answers.
  //
  // Confident replies get a quiet "wrong?" link instead, which opens the same
  // chips. Without it a *confidently* wrong answer — the most damaging kind —
  // had no path to a correction at all, and those are exactly the rows worth
  // labelling.
  const candidates = msg.candidates || [];
  const canCorrect = !!onCorrect && !msg.corrected && candidates.length > 0;
  const [open, setOpen] = React.useState(false);
  const showCorrection = canCorrect && (!!msg.ask || open);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: msg.isAction ? theme.soft : theme.surface,
            borderColor: msg.isAction ? "transparent" : theme.line,
            borderWidth: msg.isAction ? 0 : 1,
          },
        ]}
      >
        {msg.isAction ? (
          <View style={styles.actRow}>
            <Text style={{ color: theme.accent, fontSize: 15 }}>✓</Text>
            <Text style={{ color: theme.text, fontWeight: "600", fontSize: 15, flexShrink: 1 }}>{msg.text}</Text>
          </View>
        ) : (
          <Text style={{ color: theme.text, fontSize: 15, writingDirection: isRtlText(msg.text) ? "rtl" : "ltr" }}>
            {msg.text}
          </Text>
        )}
      </View>

      <ModelLine msg={msg} />

      {showCorrection && (
        <View style={styles.correctWrap}>
          <View style={styles.chips}>
            {candidates.map((c) => (
              <Pressable
                key={c}
                onPress={() => onCorrect!(c)}
                style={[styles.chip, { backgroundColor: theme.chip, borderColor: theme.line }]}
                accessibilityRole="button"
              >
                <Text style={{ color: theme.text, fontSize: 12 }}>{humanizeIntent(c)}</Text>
              </Pressable>
            ))}
            {/* "None of these" is the only way to record that the command is
                outside the model's 34 intents entirely. Those rows are what let
                the out-of-scope thresholds be tuned rather than guessed. */}
            <Pressable
              onPress={() => onCorrect!(NONE_INTENT)}
              style={[styles.chip, { borderColor: theme.line }]}
              accessibilityRole="button"
            >
              <Text style={{ color: theme.muted, fontSize: 12 }}>{t("c_none")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {canCorrect && !msg.ask && !open && (
        <Pressable onPress={() => setOpen(true)} hitSlop={10} style={styles.wrongWrap}>
          <Text style={[styles.correctLabel, { color: theme.muted }]}>{t("c_not_right")}</Text>
        </Pressable>
      )}

      {msg.corrected && (
        <Text style={[styles.correctLabel, { color: theme.accent, marginTop: 6 }]}>
          {msg.corrected === NONE_INTENT
            ? `✓ ${t("c_noted_none")}`
            : `✓ ${t("c_thanks")} — ${humanizeIntent(msg.corrected)}`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start", maxWidth: "86%", marginBottom: 12 },
  bubble: { paddingVertical: 11, paddingHorizontal: 14, borderRadius: 16, borderBottomLeftRadius: 5 },
  actRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modelLine: { marginTop: 5, marginLeft: 4, marginBottom: 10, fontSize: 11 },
  correctWrap: { marginTop: 7 },
  wrongWrap: { marginTop: 6, alignSelf: "flex-start" },
  correctLabel: { fontSize: 11 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 5 },
  chip: { borderWidth: 1, borderRadius: 12, paddingVertical: 5, paddingHorizontal: 10 },
});
