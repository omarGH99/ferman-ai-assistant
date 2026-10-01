import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../common/BottomSheet";
import { BRAND_QUOTE } from "../../brand";
import { useTheme } from "../../theme/ThemeProvider";
import { THEME_ORDER, THEMES } from "../../theme/themes";
import { radius, space, tracking, type, weight } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { Icon } from "../../ui/Icon";
import { WidgetKey } from "../../state/WidgetPrefsProvider";
import { Lang } from "../../i18n/strings";
import { CityPanel, PrayerMethodPanel, QuietHoursPanel } from "./SettingsPrefsPanels";
import { useSheets } from "../../ui/SheetsProvider";
import { useAppState } from "../../state/StateProvider";
import { useAuth } from "../../state/AuthProvider";
import { sendFeedback } from "../../services/auth";
import { ALL_WIDGETS, useWidgetPrefs, WIDGET_META } from "../../state/WidgetPrefsProvider";
import {
  isNotificationsEnabled,
  requestNotificationPermission,
  setNotificationsEnabled,
} from "../../services/notifications";
import { useToast } from "../../ui/ToastProvider";

type Panel =
  | "main" | "account" | "widgets" | "username" | "password"
  | "howto" | "about" | "feedback"
  | "city" | "prayermethod" | "quiet";

// A tiny, read-only preview of the kind of spreadsheet the Excel import accepts.
// The column headers are shown in English because the importer matches them by
// name (Task/Title, Date, Time, Status, Notes).
const EXCEL_COLS = ["Task", "Date", "Time", "Status", "Notes"];
const EXCEL_ROWS = [
  ["Call Azad", "2026-08-01", "17:00", "pending", "bring notes"],
  ["Team meeting", "2026-08-02", "10:30", "pending", ""],
  ["Buy groceries", "2026-08-03", "", "pending", "milk, eggs"],
];

function ExcelExample({ caption }: { caption: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ marginTop: 4 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={[styles.table, { borderColor: theme.line }]}>
          <View style={[styles.trHead, { backgroundColor: theme.soft, borderColor: theme.line }]}>
            {EXCEL_COLS.map((c) => (
              <Text key={c} style={[styles.th, { color: theme.text, borderColor: theme.line }]}>{c}</Text>
            ))}
          </View>
          {EXCEL_ROWS.map((row, i) => (
            <View key={i} style={[styles.tr, { borderColor: theme.line }]}>
              {row.map((cell, j) => (
                <Text key={j} style={[styles.td, { color: theme.muted, borderColor: theme.line }]}>
                  {cell || "—"}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={[styles.caption, { color: theme.muted }]}>{caption}</Text>
    </View>
  );
}

export function SettingsSheet() {
  const { theme, themeName, setThemeName } = useTheme();
  const { t, lang, setLang } = useI18n();
  const { activeSheet, closeSheet } = useSheets();
  const { user, token, signOut, updateConsent, updateUsername, changePassword } = useAuth();
  const { layout, setOn, setWidth, move, resetLayout } = useWidgetPrefs();
  const { showToast } = useToast();

  const [panel, setPanel] = useState<Panel>("main");
  const [confirmClear, setConfirmClear] = useState(false);
  const st = useAppState();
  const [notifsOn, setNotifsOn] = useState(false);
  const [consentBusy, setConsentBusy] = useState(false);

  // account-form state
  const [newUsername, setNewUsername] = useState("");
  const [curPassword, setCurPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  // feedback-form state
  const [fbMessage, setFbMessage] = useState("");
  const [fbRating, setFbRating] = useState(0);
  const [fbBusy, setFbBusy] = useState(false);

  useEffect(() => {
    if (activeSheet === "settings") {
      setPanel("main");
      setFormError(null);
      isNotificationsEnabled().then(setNotifsOn);
    }
  }, [activeSheet]);

  async function toggleNotifs() {
    if (notifsOn) {
      await setNotificationsEnabled(false);
      setNotifsOn(false);
      showToast(t("notifs_off_toast"));
      return;
    }
    const granted = await requestNotificationPermission();
    if (!granted) {
      showToast(t("notifs_denied"));
      return;
    }
    await setNotificationsEnabled(true);
    setNotifsOn(true);
    showToast(t("notifs_on_toast"));
  }

  async function toggleConsent(next: boolean) {
    setConsentBusy(true);
    try {
      await updateConsent(next);
      showToast(next ? t("collect_on") : t("collect_off"));
    } catch {
      showToast(t("auth_error_generic"));
    } finally {
      setConsentBusy(false);
    }
  }

  // Two taps rather than a toast-undo: this wipes every task, list and the water
  // log at once. Unlike a single delete there is no small thing to hand back if
  // the undo window is missed.
  function onClearData() {
    if (!confirmClear) {
      setConfirmClear(true);
      showToast(t("clear_all_confirm"));
      setTimeout(() => setConfirmClear(false), 5000);
      return;
    }
    setConfirmClear(false);
    st.clearAllData();
    showToast(t("clear_all_done"));
  }

  function onSignOut() {
    closeSheet();
    signOut();
  }

  async function submitFeedback() {
    if (!fbMessage.trim()) {
      showToast(t("feedback_empty"));
      return;
    }
    setFbBusy(true);
    try {
      await sendFeedback(token, fbMessage.trim(), fbRating || null);
      showToast(t("feedback_thanks"));
      setFbMessage("");
      setFbRating(0);
      setPanel("main");
    } catch {
      showToast(t("auth_error_generic"));
    } finally {
      setFbBusy(false);
    }
  }

  async function saveUsername() {
    setFormError(null);
    setFormBusy(true);
    try {
      await updateUsername(newUsername.trim());
      showToast(t("uname_changed"));
      setNewUsername("");
      setPanel("account");
    } catch (e: any) {
      setFormError(e?.message || t("auth_error_generic"));
    } finally {
      setFormBusy(false);
    }
  }

  async function savePassword() {
    setFormError(null);
    setFormBusy(true);
    try {
      await changePassword(curPassword, newPassword);
      showToast(t("pw_changed"));
      setCurPassword("");
      setNewPassword("");
      setPanel("account");
    } catch (e: any) {
      setFormError(e?.message || t("auth_error_generic"));
    } finally {
      setFormBusy(false);
    }
  }

  const title =
    panel === "account" ? t("user_settings")
    : panel === "widgets" ? t("feed_widgets")
    : panel === "city" ? t("s_city")
    : panel === "prayermethod" ? t("s_prayer_method")
    : panel === "quiet" ? t("s_quiet")
    : panel === "username" ? t("change_username")
    : panel === "password" ? t("change_password")
    : panel === "howto" ? t("how_to_use")
    : panel === "about" ? t("about")
    : panel === "feedback" ? t("send_feedback")
    : t("settings");

  const inputStyle = [
    styles.input,
    { borderColor: theme.line, backgroundColor: theme.surface, color: theme.text },
  ];

  const SectionHeader = ({ label }: { label: string }) => (
    <Text style={[styles.section, { color: theme.muted }]}>{label}</Text>
  );

  const NavRow = ({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) => (
    <Pressable
      style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.line }]}
      onPress={onPress}
    >
      <Text style={{ color: danger ? theme.danger : theme.text, fontSize: 15 }}>{label}</Text>
      {!danger && <Text style={{ color: theme.muted, fontSize: 17 }}>›</Text>}
    </Pressable>
  );

  const BackButton = ({ to }: { to: Panel }) => (
    <Pressable style={styles.back} onPress={() => { setPanel(to); setFormError(null); }}>
      <Text style={{ color: theme.accent, fontSize: 15 }}>‹ {t("back")}</Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={activeSheet === "settings"} onClose={closeSheet} title={title}>
      {panel === "main" && (
        <>
          <SectionHeader label={t("s_account")} />
          <NavRow label={t("user_settings")} onPress={() => setPanel("account")} />

          <SectionHeader label={t("s_feed")} />
          <NavRow label={t("feed_widgets")} onPress={() => setPanel("widgets")} />

          <SectionHeader label={t("s_notifications")} />
          <View style={[styles.toggleRow, { backgroundColor: theme.surface, borderColor: theme.line }]}>
            <Text style={{ color: theme.text, fontSize: 15 }}>{t("reminder_alerts")}</Text>
            <Switch value={notifsOn} onValueChange={toggleNotifs} />
          </View>
          <NavRow label={t("s_quiet")} onPress={() => setPanel("quiet")} />

          <SectionHeader label={t("s_location")} />
          <NavRow label={t("s_city")} onPress={() => setPanel("city")} />
          <NavRow label={t("s_prayer_method")} onPress={() => setPanel("prayermethod")} />

          <SectionHeader label={t("s_data")} />
          {user && (
            <View style={[styles.toggleRow, { backgroundColor: theme.surface, borderColor: theme.line }]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: theme.text, fontSize: 15 }}>{t("collect_label")}</Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{t("collect_hint")}</Text>
              </View>
              <Switch value={user.consent_data_collection} disabled={consentBusy} onValueChange={toggleConsent} />
            </View>
          )}

          {/* clearAllData has existed in StateProvider since the start and was
              wired to nothing. Asking people to opt into collection without
              offering a way out is not a defensible place to leave it. */}
          <Pressable
            style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.line }]}
            onPress={onClearData}
          >
            <Text style={{ color: theme.danger, fontSize: 15 }}>{t("clear_all_data")}</Text>
          </Pressable>

          <SectionHeader label={t("s_language")} />
          <View style={styles.themes}>
            {(["en", "ar", "ku"] as Lang[]).map((l) => {
              const selected = l === lang;
              return (
                <Pressable
                  key={l}
                  onPress={() => setLang(l)}
                  style={[
                    styles.langOpt,
                    {
                      backgroundColor: selected ? theme.soft : theme.surface,
                      borderColor: selected ? theme.accent : theme.line,
                    },
                  ]}
                >
                  <Text style={{ color: selected ? theme.accent : theme.text, fontWeight: selected ? "700" : "500" }}>
                    {t(`lang_${l}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <SectionHeader label={t("s_help")} />
          <NavRow label={t("how_to_use")} onPress={() => setPanel("howto")} />
          <NavRow label={t("send_feedback")} onPress={() => { setFbMessage(""); setFbRating(0); setPanel("feedback"); }} />
          <NavRow label={t("about")} onPress={() => setPanel("about")} />

          <SectionHeader label={t("s_appearance")} />
          <Text style={[styles.label, { color: theme.muted }]}>{t("theme")}</Text>
          <View style={styles.themes}>
            {THEME_ORDER.map((opt) => {
              const th = THEMES[opt];
              const selected = opt === themeName;
              return (
                <Pressable
                  key={opt}
                  onPress={() => setThemeName(opt)}
                  style={[styles.swatch, { backgroundColor: th.bg, borderColor: selected ? theme.accent : theme.line }]}
                >
                  <View style={[styles.dot, { backgroundColor: th.accent }]} />
                  <Text style={[styles.swatchLabel, { color: th.text }]}>{t("theme_" + opt)}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.devBadge, { backgroundColor: theme.accent }]}>
            <Text style={[styles.devBadgeText, { color: theme.accentInk }]}>{t("developed_by")}</Text>
          </View>
        </>
      )}

      {panel === "feedback" && (
        <>
          <BackButton to="main" />
          <Text style={[styles.hint, { color: theme.muted }]}>{t("feedback_intro")}</Text>

          <Text style={[styles.label, { color: theme.muted }]}>{t("feedback_rating")}</Text>
          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setFbRating(n === fbRating ? 0 : n)} hitSlop={6}>
                <Text style={[styles.star, { color: n <= fbRating ? theme.accent : theme.line }]}>★</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={fbMessage}
            onChangeText={setFbMessage}
            placeholder={t("feedback_placeholder")}
            placeholderTextColor={theme.muted}
            multiline
            textAlignVertical="top"
            style={[inputStyle, styles.textarea]}
          />
          <Pressable
            style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: fbBusy ? 0.6 : 1 }]}
            disabled={fbBusy}
            onPress={submitFeedback}
          >
            {fbBusy ? <ActivityIndicator color={theme.accentInk} />
              : <Text style={{ color: theme.accentInk, fontWeight: "600", fontSize: 15 }}>{t("feedback_send")}</Text>}
          </Pressable>
        </>
      )}

      {panel === "howto" && (
        <>
          <BackButton to="main" />
          <Text style={[styles.hint, { color: theme.muted }]}>{t("howto_intro")}</Text>
          {["howto_b1", "howto_b2", "howto_b3", "howto_b4", "howto_b5", "howto_b6", "howto_b7", "howto_b8", "howto_b9"].map((k) => (
            <View key={k} style={styles.bulletRow}>
              <Text style={[styles.bulletDot, { color: theme.accent }]}>•</Text>
              <Text style={[styles.bulletText, { color: theme.text }]}>{t(k)}</Text>
            </View>
          ))}

          <Text style={[styles.subHeading, { color: theme.text }]}>{t("howto_excel_title")}</Text>
          <Text style={[styles.hint, { color: theme.muted }]}>{t("howto_excel_body")}</Text>
          <ExcelExample caption={t("excel_caption")} />
          <Text style={[styles.excelNote, { color: theme.muted }]}>{t("excel_note")}</Text>
        </>
      )}

      {panel === "about" && (
        <>
          <BackButton to="main" />
          <Text style={[styles.aboutLogo, { color: theme.accent }]}>Ferman</Text>
          <View style={[styles.quoteBox, { backgroundColor: theme.soft, borderColor: theme.accent }]}>
            <Text style={[styles.quote, { color: theme.text }]}>{BRAND_QUOTE}</Text>
          </View>
          <Text style={[styles.aboutBody, { color: theme.text }]}>{t("about_body")}</Text>
          <View style={[styles.devBadge, { backgroundColor: theme.accent }]}>
            <Text style={[styles.devBadgeText, { color: theme.accentInk }]}>{t("developed_by")}</Text>
          </View>
        </>
      )}

      {panel === "account" && user && (
        <>
          <BackButton to="main" />
          <View style={[styles.infoCard, { backgroundColor: theme.soft }]}>
            <Text style={{ color: theme.text, fontWeight: "700", fontSize: 15 }}>{user.username}</Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{user.email}</Text>
          </View>
          <NavRow label={t("change_username")} onPress={() => { setNewUsername(user.username); setPanel("username"); }} />
          <NavRow label={t("change_password")} onPress={() => setPanel("password")} />
          <NavRow label={t("sign_out")} danger onPress={onSignOut} />
        </>
      )}

      {panel === "city" && (
        <>
          <BackButton to="main" />
          <CityPanel />
        </>
      )}

      {panel === "prayermethod" && (
        <>
          <BackButton to="main" />
          <PrayerMethodPanel />
        </>
      )}

      {panel === "quiet" && (
        <>
          <BackButton to="main" />
          <QuietHoursPanel />
        </>
      )}

      {panel === "widgets" && (
        <>
          <BackButton to="main" />
          <Text style={[styles.hint, { color: theme.muted }]}>{t("widgets_hint")}</Text>
          {/* Arrows rather than drag-and-drop: dragging needs a gesture library,
              behaves differently on web and native, and is hard to verify. The
              stored layout is the same either way, so dragging can replace this
              later without touching the data. */}
          {layout.map((w, i) => {
            const key = w.key as WidgetKey;
            const meta = WIDGET_META[key];
            if (!meta) return null;
            return (
              <View
                key={w.key}
                style={[
                  styles.widgetRow,
                  { backgroundColor: theme.surface, borderColor: w.on ? theme.accent : theme.line },
                ]}
              >
                <View style={styles.arrows}>
                  <Pressable
                    onPress={() => move(key, -1)}
                    disabled={i === 0}
                    hitSlop={8}
                    style={{ opacity: i === 0 ? 0.25 : 1 }}
                    accessibilityLabel={t("move_up")}
                  >
                    <Text style={{ color: theme.text, fontSize: 15 }}>▲</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => move(key, 1)}
                    disabled={i === layout.length - 1}
                    hitSlop={8}
                    style={{ opacity: i === layout.length - 1 ? 0.25 : 1 }}
                    accessibilityLabel={t("move_down")}
                  >
                    <Text style={{ color: theme.text, fontSize: 15 }}>▼</Text>
                  </Pressable>
                </View>

                <Icon name={meta.icon} size={18} color={w.on ? theme.accent : theme.muted} />
                <Text style={{ color: theme.text, fontSize: 15, flex: 1 }} numberOfLines={1}>
                  {t(meta.labelKey)}
                </Text>

                <Pressable
                  onPress={() => setWidth(key, w.width === "half" ? "full" : "half")}
                  hitSlop={8}
                  style={[styles.widthChip, { borderColor: theme.line, backgroundColor: theme.chip }]}
                  accessibilityLabel={t(w.width === "half" ? "width_half" : "width_full")}
                >
                  <Text style={{ color: theme.muted, fontSize: 11 }}>
                    {t(w.width === "half" ? "width_half" : "width_full")}
                  </Text>
                </Pressable>

                <Switch value={w.on} onValueChange={(v) => setOn(key, v)} />
              </View>
            );
          })}

          <Pressable
            style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.line, marginTop: 12 }]}
            onPress={() => {
              resetLayout();
              showToast(t("layout_reset"));
            }}
          >
            <Text style={{ color: theme.muted, fontSize: 15 }}>{t("reset_layout")}</Text>
          </Pressable>
        </>
      )}

      {panel === "username" && (
        <>
          <BackButton to="account" />
          <Text style={[styles.label, { color: theme.muted }]}>{t("new_username")}</Text>
          <TextInput
            value={newUsername}
            onChangeText={setNewUsername}
            autoCapitalize="none"
            placeholder={t("new_username")}
            placeholderTextColor={theme.muted}
            style={inputStyle}
          />
          {formError && <Text style={[styles.error, { color: theme.danger }]}>{formError}</Text>}
          <Pressable
            style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: formBusy ? 0.6 : 1 }]}
            disabled={formBusy}
            onPress={saveUsername}
          >
            {formBusy ? <ActivityIndicator color={theme.accentInk} />
              : <Text style={{ color: theme.accentInk, fontWeight: "600", fontSize: 15 }}>{t("save_changes")}</Text>}
          </Pressable>
        </>
      )}

      {panel === "password" && (
        <>
          <BackButton to="account" />
          <Text style={[styles.label, { color: theme.muted }]}>{t("current_password")}</Text>
          <TextInput
            value={curPassword}
            onChangeText={setCurPassword}
            secureTextEntry
            placeholder={t("current_password")}
            placeholderTextColor={theme.muted}
            style={inputStyle}
          />
          <Text style={[styles.label, { color: theme.muted }]}>{t("new_password")}</Text>
          <TextInput
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
            placeholder={t("new_password")}
            placeholderTextColor={theme.muted}
            style={inputStyle}
          />
          {formError && <Text style={[styles.error, { color: theme.danger }]}>{formError}</Text>}
          <Pressable
            style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: formBusy ? 0.6 : 1 }]}
            disabled={formBusy}
            onPress={savePassword}
          >
            {formBusy ? <ActivityIndicator color={theme.accentInk} />
              : <Text style={{ color: theme.accentInk, fontWeight: "600", fontSize: 15 }}>{t("save_changes")}</Text>}
          </Pressable>
        </>
      )}
    </BottomSheet>
  );
}

/** Line heights are left as literals on purpose.
 *
 * They belong to the type they set, not to the spacing grid — a 13pt bullet
 * wants ~21, and rounding that to the nearest 4pt step would either crowd the
 * text or leave it swimming. Everything that is *space between things* uses the
 * scale; everything that is *inside a line of text* stays with its font size.
 */
const styles = StyleSheet.create({
  section: {
    fontSize: type.xs,
    textTransform: "uppercase",
    letterSpacing: tracking.wide,
    fontWeight: weight.semibold,
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  label: { fontSize: type.sm, marginBottom: space.sm, marginTop: space.sm },
  hint: { fontSize: type.base, marginBottom: space.md, marginTop: space.xs },
  infoCard: { borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  langOpt: { flex: 1, borderWidth: 1.5, borderRadius: radius.md, paddingVertical: space.md, alignItems: "center" },
  widgetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  arrows: { justifyContent: "center", gap: 2 },
  widthChip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: space.xs },
  themes: { flexDirection: "row", gap: space.md, marginBottom: space.xs },
  swatch: {
    flex: 1,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 2,
    padding: space.sm,
    justifyContent: "space-between",
  },
  dot: { width: 14, height: 14, borderRadius: radius.sm, alignSelf: "flex-end" },
  swatchLabel: { fontSize: type.sm, fontWeight: weight.semibold },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    fontSize: type.md,
  },
  error: { fontSize: type.base, marginTop: space.md },
  saveBtn: { borderRadius: radius.md, paddingVertical: space.lg, alignItems: "center", marginTop: space.lg },
  back: { paddingVertical: space.sm, marginBottom: space.sm },

  // developer badge (green rectangle)
  devBadge: {
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: "center",
    marginTop: space.xl,
    marginBottom: space.sm,
  },
  devBadgeText: { fontSize: type.base, fontWeight: weight.bold, letterSpacing: 0.3 },

  // how-to
  bulletRow: { flexDirection: "row", marginBottom: space.md, paddingRight: space.sm },
  bulletDot: { fontSize: type.md, lineHeight: 21, marginRight: space.sm },
  bulletText: { flex: 1, fontSize: type.base, lineHeight: 21 },
  subHeading: { fontSize: type.md, fontWeight: weight.bold, marginTop: space.xl, marginBottom: space.sm },
  excelNote: { fontSize: type.sm, lineHeight: 18, marginTop: space.md },
  caption: { fontSize: type.xs, marginTop: space.sm },

  // excel preview table
  table: { borderWidth: 1, borderRadius: radius.sm, overflow: "hidden" },
  trHead: { flexDirection: "row", borderBottomWidth: 1 },
  tr: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  th: {
    minWidth: 92,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    fontSize: type.sm,
    fontWeight: weight.bold,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  td: {
    minWidth: 92,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    fontSize: type.sm,
    borderRightWidth: StyleSheet.hairlineWidth,
  },

  // feedback
  stars: { flexDirection: "row", gap: space.sm, marginBottom: space.md, marginTop: 2 },
  star: { fontSize: type.display },
  textarea: { minHeight: 120, paddingTop: space.md },

  // about
  aboutLogo: {
    fontSize: type.display,
    fontWeight: "800",
    textAlign: "center",
    marginTop: space.xs,
    marginBottom: space.lg,
    letterSpacing: tracking.tight,
  },
  aboutBody: { fontSize: type.base, lineHeight: 22, marginTop: space.xs },
  quoteBox: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.lg,
  },
  quote: { fontSize: type.base, lineHeight: 20, textAlign: "center" },
});
