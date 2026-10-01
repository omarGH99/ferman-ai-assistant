import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { useVoiceInput } from "../../hooks/useVoiceInput";

export function Composer({ onSend, onClear }: { onSend: (text: string) => void; onClear?: () => void }) {
  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const [text, setText] = useState("");

  const voice = useVoiceInput(lang, (heard) =>
    setText((prev) => (prev ? prev.trim() + " " : "") + heard)
  );

  function submit() {
    const value = text.trim();
    if (!value) return;
    setText("");
    onSend(value);
  }

  return (
    <View style={[styles.wrap, { backgroundColor: theme.header, borderTopColor: theme.line }]}>
      {onClear && (
        <Pressable style={[styles.clear, { backgroundColor: theme.chip }]} onPress={onClear} hitSlop={4}>
          <Text style={{ fontSize: 15 }}>🗑️</Text>
        </Pressable>
      )}
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={voice.listening ? t("listening") : t("msg_ph")}
        placeholderTextColor={theme.muted}
        style={[styles.input, { borderColor: theme.line, backgroundColor: theme.bg, color: theme.text }]}
        onSubmitEditing={submit}
        returnKeyType="send"
      />
      {voice.supported && (
        <Pressable
          style={[
            styles.mic,
            { backgroundColor: voice.listening ? theme.danger : theme.chip },
          ]}
          onPress={() => (voice.listening ? voice.stop() : voice.start())}
          hitSlop={4}
        >
          <Text style={{ fontSize: 15 }}>{voice.listening ? "⏹" : "🎤"}</Text>
        </Pressable>
      )}
      <Pressable style={[styles.send, { backgroundColor: theme.accent }]} onPress={submit}>
        <Text style={{ color: theme.accentInk, fontSize: 15 }}>➤</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderTopWidth: 1 },
  clear: { width: 42, height: 42, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, borderWidth: 1, borderRadius: 22, paddingVertical: 11, paddingHorizontal: 16, fontSize: 15 },
  mic: { width: 42, height: 42, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  send: { width: 42, height: 42, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
