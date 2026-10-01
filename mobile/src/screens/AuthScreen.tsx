import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { useI18n } from "../i18n/I18nProvider";
import { useAuth } from "../state/AuthProvider";
import { BRAND_QUOTE } from "../brand";
import { withSlowNotice } from "../services/api";

type Mode = "signin" | "signup";

export function AuthScreen() {
  const { theme } = useTheme();
  const { t, chromeRtl } = useI18n();
  const { signIn, signUp } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [loginId, setLoginId] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Signing in is usually the first request of the session, so it is the one
  // that pays the server's cold start. Explain the wait instead of leaving a
  // spinner sitting there for 30 seconds.
  const [waking, setWaking] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    setWaking(false);
    try {
      const req =
        mode === "signin"
          ? signIn(loginId.trim(), password)
          : signUp(username.trim(), email.trim(), password);
      await withSlowNotice(req, () => setWaking(true));
    } catch (e: any) {
      setError(e?.message || t("auth_error_generic"));
    } finally {
      setBusy(false);
      setWaking(false);
    }
  }

  function switchMode() {
    setError(null);
    setMode((m) => (m === "signin" ? "signup" : "signin"));
  }

  const inputStyle = [
    styles.input,
    { borderColor: theme.line, backgroundColor: theme.surface, color: theme.text },
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg, direction: chromeRtl ? "rtl" : "ltr" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* The brand tile, drawn rather than imported, so it always matches the
            app icon's colour and stacking without shipping a second bitmap. */}
        <View style={styles.logoTile}>
          <Text style={styles.logoLine}>Fer</Text>
          <Text style={styles.logoLine}>man</Text>
        </View>
        <Text style={[styles.title, { color: theme.text }]}>{t("auth_welcome")}</Text>
        <Text style={[styles.tagline, { color: theme.muted }]}>{t("auth_tagline")}</Text>

        <View style={[styles.quoteBox, { backgroundColor: theme.soft, borderColor: theme.accent }]}>
          <Text style={[styles.quote, { color: theme.text }]}>{BRAND_QUOTE}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.line }]}>
          {mode === "signup" && (
            <>
              <Text style={[styles.label, { color: theme.muted }]}>{t("auth_username")}</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                placeholder={t("auth_username")}
                placeholderTextColor={theme.muted}
                style={inputStyle}
              />
              <Text style={[styles.label, { color: theme.muted }]}>{t("auth_email")}</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder={t("auth_email")}
                placeholderTextColor={theme.muted}
                style={inputStyle}
              />
            </>
          )}

          {mode === "signin" && (
            <>
              <Text style={[styles.label, { color: theme.muted }]}>{t("auth_login_id")}</Text>
              <TextInput
                value={loginId}
                onChangeText={setLoginId}
                autoCapitalize="none"
                placeholder={t("auth_login_id")}
                placeholderTextColor={theme.muted}
                style={inputStyle}
              />
            </>
          )}

          <View style={styles.pwLabelRow}>
            <Text style={[styles.label, { color: theme.muted }]}>{t("auth_password")}</Text>
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8}>
              <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "600" }}>
                {showPw ? t("hide") : t("show")}
              </Text>
            </Pressable>
          </View>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPw}
            placeholder={t("auth_password")}
            placeholderTextColor={theme.muted}
            style={inputStyle}
            onSubmitEditing={submit}
          />

          {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={[styles.button, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color={theme.accentInk} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.accentInk }]}>
                {mode === "signin" ? t("auth_submit_signin") : t("auth_submit_signup")}
              </Text>
            )}
          </Pressable>

          {waking && (
            <Text style={[styles.waking, { color: theme.muted }]}>{t("waking_up")}</Text>
          )}
        </View>

        <Pressable onPress={switchMode} style={styles.switch}>
          <Text style={{ color: theme.muted }}>
            {mode === "signin" ? t("auth_no_account") : t("auth_have_account")}{" "}
            <Text style={{ color: theme.accent, fontWeight: "600" }}>
              {mode === "signin" ? t("auth_switch_signup") : t("auth_switch_signin")}
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logoTile: {
    width: 76,
    height: 76,
    borderRadius: 16,
    backgroundColor: "#059669",   // fixed brand green — the tile is the logo, not themed chrome
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  logoLine: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", lineHeight: 27, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  tagline: { fontSize: 13, textAlign: "center", marginTop: 4, marginBottom: 18 },
  quoteBox: { borderWidth: 1, borderLeftWidth: 3, borderRadius: 12, padding: 14, marginBottom: 22 },
  quote: { fontSize: 13, lineHeight: 20, fontStyle: "italic", textAlign: "center" },
  card: { borderWidth: 1, borderRadius: 16, padding: 18 },
  label: { fontSize: 12, marginBottom: 6, marginTop: 10 },
  pwLabelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  input: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, fontSize: 15 },
  error: { fontSize: 13, marginTop: 12 },
  waking: { fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: "center" },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 18 },
  buttonText: { fontSize: 15, fontWeight: "600" },
  switch: { marginTop: 20, alignItems: "center" },
});
