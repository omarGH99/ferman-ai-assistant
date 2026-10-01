import React, { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type } from "../../theme/tokens";
import { useI18n, isRtlText } from "../../i18n/I18nProvider";
import { useAuth } from "../../state/AuthProvider";
import { useAppState } from "../../state/StateProvider";
import { useToast } from "../../ui/ToastProvider";
import { useSheets } from "../../ui/SheetsProvider";
import { Icon } from "../../ui/Icon";
import { createShare, fetchShare, ShareKind, SharedBundle } from "../../services/auth";
import { shareViaTelegram, shareViaWhatsApp } from "../../services/deepLinks";

/** Share hands over a copy: the sender's items are stored under a code, and the
 * recipient's own app writes them into its own list. Nothing ever writes into
 * another account's data, which is what keeps the one-writer-per-blob rule that
 * /state's last-write-wins sync depends on.
 *
 * The link is only useful on web; a native build has no URL to open, so the code
 * is always shown and can always be typed in. */
export function ShareControls({ kind, items }: { kind: ShareKind; items: any[] }) {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { token } = useAuth();
  const st = useAppState();
  const { showToast } = useToast();

  const [panel, setPanel] = useState<null | "sent" | "receive">(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [entry, setEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SharedBundle | null>(null);
  const { pendingShareCode, clearPendingShare } = useSheets();

  // Arrived via a share link: open the receive panel and look the code up
  // straight away, so the recipient sees the preview rather than a form.
  useEffect(() => {
    if (!pendingShareCode || !token) return;
    const code = pendingShareCode;
    clearPendingShare();
    setEntry(code);
    setPanel("receive");
    setBusy(true);
    fetchShare(token, code)
      .then(setPreview)
      .catch((e) => setError(e?.message || t("share_bad_code")))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShareCode, token]);

  const link = code && typeof window !== "undefined" && window.location
    ? `${window.location.origin}/?s=${code}`
    : "";

  async function onShare() {
    if (!token) return;
    if (!items.length) {
      showToast(t("share_nothing"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await createShare(token, kind, items);
      setCode(r.code);
      setPanel("sent");
    } catch (e: any) {
      showToast(e?.message || t("share_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function onLookup() {
    if (!token || entry.trim().length < 4) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await fetchShare(token, entry));
    } catch (e: any) {
      setError(e?.message || t("share_bad_code"));
    } finally {
      setBusy(false);
    }
  }

  /** Rebuild each item locally rather than trusting the payload's shape. Ids,
   * statuses and notification ids belong to the sender's device, so the
   * recipient gets fresh ones. */
  function onAccept() {
    if (!preview) return;
    let n = 0;
    for (const raw of preview.items) {
      if (preview.kind === "shopping") {
        const name = String(raw?.name ?? raw ?? "").trim();
        if (!name) continue;
        st.addShoppingItem(name);
        n++;
      } else {
        const title = String(raw?.title ?? "").trim();
        if (!title) continue;
        st.addEvent({
          title,
          date: raw?.date ?? null,
          time: String(raw?.time ?? ""),
          recur: raw?.recur ?? null,
          notes: String(raw?.notes ?? ""),
          kind: raw?.kind === "alarm" ? "alarm" : "reminder",
        });
        n++;
      }
    }
    setPreview(null);
    setEntry("");
    setPanel(null);
    showToast(`${t("share_added")} ${n}`);
  }

  async function copy(text: string) {
    try {
      if (typeof navigator !== "undefined" && (navigator as any).clipboard) {
        await (navigator as any).clipboard.writeText(text);
        showToast(t("share_copied"));
        return;
      }
    } catch {
      /* fall through */
    }
    showToast(Platform.OS === "web" ? t("share_copy_manual") : t("share_copy_manual"));
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.buttons}>
        <Pressable
          style={[styles.btn, { backgroundColor: theme.accent }]}
          onPress={onShare}
          disabled={busy}
        >
          {busy && panel !== "receive" ? (
            <ActivityIndicator color={theme.accentInk} size="small" />
          ) : (
            <View style={styles.btnRow}>
              <Icon name="share" size={15} color={theme.accentInk} />
              <Text style={{ color: theme.accentInk, fontWeight: "700", fontSize: 13 }}>
                {t("share_list")}
              </Text>
            </View>
          )}
        </Pressable>
        <Pressable
          style={[styles.btn, { borderWidth: 1, borderColor: theme.line }]}
          onPress={() => {
            setPanel(panel === "receive" ? null : "receive");
            setError(null);
            setPreview(null);
          }}
        >
          <Text style={{ color: theme.text, fontSize: 13 }}>{t("have_code")}</Text>
        </Pressable>
      </View>

      {panel === "sent" && (
        <View style={[styles.panel, { backgroundColor: theme.soft, borderColor: theme.accent }]}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>{t("share_code_label")}</Text>
          <Text selectable style={[styles.code, { color: theme.accent }]}>
            {code}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
            {t("share_expires")}
          </Text>
          {!!link && (
            <Text selectable style={{ color: theme.text, fontSize: 12, marginTop: 8 }} numberOfLines={2}>
              {link}
            </Text>
          )}
          <View style={styles.buttons}>
            {/* Handing the link to WhatsApp beats "copy this and send it
                somehow" — it is how people here pass things around, and it
                needs no API, key or integration on our side. */}
            <Pressable
              style={[styles.btn, { backgroundColor: theme.accent }]}
              onPress={() => shareViaWhatsApp(`${t("share_wa_text")} ${link || code}`)}
            >
              <Text style={{ color: theme.accentInk, fontSize: 13, fontWeight: "700" }}>WhatsApp</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { borderWidth: 1, borderColor: theme.line }]}
              onPress={() => shareViaTelegram(link || code, t("share_wa_text"))}
            >
              <Text style={{ color: theme.text, fontSize: 13 }}>Telegram</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { borderWidth: 1, borderColor: theme.line }]}
              onPress={() => copy(link || code)}
            >
              <Text style={{ color: theme.text, fontSize: 13 }}>{t("share_copy")}</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { borderWidth: 1, borderColor: theme.line }]}
              onPress={() => setPanel(null)}
            >
              <Text style={{ color: theme.muted, fontSize: 13 }}>{t("done")}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {panel === "receive" && (
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.line }]}>
          {!preview ? (
            <>
              <Text style={{ color: theme.muted, fontSize: 12 }}>{t("receive_hint")}</Text>
              <View style={styles.row}>
                <TextInput
                  value={entry}
                  onChangeText={(v) => setEntry(v.toUpperCase())}
                  placeholder="ABC123"
                  placeholderTextColor={theme.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  style={[styles.input, { borderColor: theme.line, color: theme.text, backgroundColor: theme.bg }]}
                />
                <Pressable
                  style={[styles.btn, { backgroundColor: theme.accent }]}
                  onPress={onLookup}
                  disabled={busy}
                >
                  {busy ? (
                    <ActivityIndicator color={theme.accentInk} size="small" />
                  ) : (
                    <Text style={{ color: theme.accentInk, fontWeight: "700", fontSize: 13 }}>
                      {t("receive_lookup")}
                    </Text>
                  )}
                </Pressable>
              </View>
              {!!error && (
                <Text style={{ color: theme.danger, fontSize: 12, marginTop: 8 }}>{error}</Text>
              )}
            </>
          ) : (
            <>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                {preview.from} · {t("share_from")} ({preview.items.length})
              </Text>
              <View style={{ marginTop: 8 }}>
                {preview.items.slice(0, 8).map((it: any, i: number) => {
                  const label = String(it?.title ?? it?.name ?? it ?? "");
                  return (
                    <Text
                      key={i}
                      numberOfLines={1}
                      style={{
                        color: theme.muted,
                        fontSize: 12,
                        paddingVertical: 2,
                        writingDirection: isRtlText(label) ? "rtl" : "ltr",
                      }}
                    >
                      • {label}
                      {it?.time ? ` · ${it.time}` : ""}
                    </Text>
                  );
                })}
                {preview.items.length > 8 && (
                  <Text style={{ color: theme.muted, fontSize: 12 }}>
                    +{preview.items.length - 8}
                  </Text>
                )}
              </View>
              <View style={styles.buttons}>
                <Pressable style={[styles.btn, { backgroundColor: theme.accent }]} onPress={onAccept}>
                  <Text style={{ color: theme.accentInk, fontWeight: "700", fontSize: 13 }}>
                    {t("share_accept")}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.btn, { borderWidth: 1, borderColor: theme.line }]}
                  onPress={() => {
                    setPreview(null);
                    setPanel(null);
                  }}
                >
                  <Text style={{ color: theme.muted, fontSize: 13 }}>{t("share_decline")}</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: space.lg },
  buttons: { flexDirection: "row", gap: space.sm, marginTop: space.md, flexWrap: "wrap" },
  btnRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  btn: {
    borderRadius: radius.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  panel: { borderWidth: 1, borderRadius: radius.md, padding: space.md, marginTop: space.md },
  // The share code is the one thing on this panel someone reads aloud or types
  // into another phone, so it keeps its wide tracking — that is legibility,
  // not decoration.
  code: { fontSize: type.xxl, fontWeight: "800", letterSpacing: 3, marginTop: 2 },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.sm, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: type.md,
    letterSpacing: 2,
  },
});
