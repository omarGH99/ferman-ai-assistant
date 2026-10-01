import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useWorkspace } from "../../state/WorkspaceProvider";
import { useSheets } from "../../ui/SheetsProvider";

/** Lists every workspace the user belongs to (tap to switch) plus a
 * create-or-join form for adding another -- the same inline create/join
 * shape WorkspaceEmptyState already used for the very first workspace, just
 * reachable now that there's at least one to switch away from. */
export function WorkspaceSwitcherSheet() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { activeSheet, closeSheet } = useSheets();
  const { workspaces, activeWorkspace, setActiveWorkspaceId, createWorkspace, joinWorkspace } = useWorkspace();

  const visible = activeSheet === "workspaceSwitcher";
  const [adding, setAdding] = useState<"create" | "join" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function reset() {
    setAdding(null);
    setName("");
    setCode("");
    setErr("");
  }

  function onSelect(id: number) {
    setActiveWorkspaceId(id);
    reset();
    closeSheet();
  }

  async function onCreate() {
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await createWorkspace(name.trim());
      reset();
      closeSheet();
    } catch (e: any) {
      setErr(e?.message || t("ws_error"));
    } finally {
      setBusy(false);
    }
  }

  async function onJoin() {
    if (!code.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await joinWorkspace(code.trim());
      reset();
      closeSheet();
    } catch (e: any) {
      setErr(e?.message || t("ws_bad_code"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet visible={visible} onClose={() => { reset(); closeSheet(); }} title={t("ws_switch_title")}>
      {workspaces.map((w) => {
        const on = w.id === activeWorkspace?.id;
        return (
          <Pressable key={w.id} onPress={() => onSelect(w.id)} style={[styles.row, { borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontSize: type.base, fontWeight: on ? weight.bold : weight.regular }}>
              {w.name}
            </Text>
            {on && <Text style={{ color: theme.accent, fontSize: type.sm }}>{t("ws_current")}</Text>}
          </Pressable>
        );
      })}

      {adding === null && (
        <View style={styles.addBtns}>
          <Pressable style={[styles.wsBtn, { backgroundColor: theme.accent }]} onPress={() => setAdding("create")}>
            <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("ws_create")}</Text>
          </Pressable>
          <Pressable style={[styles.wsBtn, { borderWidth: 1, borderColor: theme.line }]} onPress={() => setAdding("join")}>
            <Text style={{ color: theme.text, fontWeight: weight.bold }}>{t("ws_join")}</Text>
          </Pressable>
        </View>
      )}

      {adding === "create" && (
        <View style={styles.addBtns}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("ws_name_label")}
            placeholderTextColor={theme.muted}
            style={[styles.input, { borderColor: theme.line, color: theme.text }]}
          />
          <Pressable style={[styles.wsBtn, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={onCreate}>
            {busy ? <ActivityIndicator color={theme.accentInk} /> : <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("ws_create")}</Text>}
          </Pressable>
        </View>
      )}

      {adding === "join" && (
        <View style={styles.addBtns}>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder={t("ws_code_label")}
            placeholderTextColor={theme.muted}
            autoCapitalize="characters"
            style={[styles.input, { borderColor: theme.line, color: theme.text, textAlign: "center", letterSpacing: 3, fontWeight: weight.bold }]}
          />
          <Pressable style={[styles.wsBtn, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={onJoin}>
            {busy ? <ActivityIndicator color={theme.accentInk} /> : <Text style={{ color: theme.accentInk, fontWeight: weight.bold }}>{t("ws_join")}</Text>}
          </Pressable>
        </View>
      )}

      {!!err && <Text style={{ color: theme.danger, fontSize: type.sm, marginTop: space.sm }}>{err}</Text>}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  addBtns: { gap: space.sm, marginTop: space.lg },
  wsBtn: { borderRadius: radius.md, paddingVertical: space.md, alignItems: "center" },
  input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, fontSize: type.md },
});
