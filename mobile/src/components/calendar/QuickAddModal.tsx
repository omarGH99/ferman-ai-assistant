import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { useI18n } from "../../i18n/I18nProvider";

export function QuickAddModal({
  visible,
  dateISO,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  dateISO: string | null;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const [text, setText] = useState("");

  useEffect(() => {
    if (visible) setText("");
  }, [visible]);

  function submit() {
    const value = text.trim();
    if (value) onSubmit(value);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.text, fontWeight: "600", marginBottom: 4 }}>Add on {dateISO}</Text>
          <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 10 }}>e.g. "9 am meeting"</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            placeholder={t("rc_title")}
            placeholderTextColor={theme.muted}
            style={[styles.input, { borderColor: theme.line, color: theme.text }]}
            onSubmitEditing={submit}
            returnKeyType="done"
          />
          <View style={styles.row}>
            <Pressable style={styles.btn} onPress={onCancel}>
              <Text style={{ color: theme.muted }}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.btn} onPress={submit}>
              <Text style={{ color: theme.accent, fontWeight: "600" }}>Add</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", borderRadius: 16, padding: 18 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 16 },
  btn: { paddingVertical: 6, paddingHorizontal: 8 },
});
