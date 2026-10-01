import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space, type } from "../../theme/tokens";
import { useI18n } from "../../i18n/I18nProvider";
import { useToast } from "../../ui/ToastProvider";
import { DateTimeField } from "../chat/DateTimeField";
import {
  CityHit,
  PRAYER_METHODS,
  QuietHours,
  SavedCity,
  getPrayerMethod,
  getQuietHours,
  getSavedCity,
  searchCities,
  setPrayerMethod,
  setQuietHours,
  setSavedCity,
} from "../../services/prefs";

const Row = ({ children }: { children: React.ReactNode }) => {
  const { theme } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.line }]}>
      {children}
    </View>
  );
};

/** Which city the weather, air quality and prayer times are for.
 *
 * Without this, anyone who declined the location prompt silently got Duhok —
 * wrong temperature, wrong air quality, and prayer times off by real minutes. */
export function CityPanel() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { showToast } = useToast();
  const [current, setCurrent] = useState<SavedCity | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CityHit[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSavedCity().then(setCurrent);
  }, []);

  // Debounced so typing doesn't fire a request per keystroke at Open-Meteo.
  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setBusy(true);
    const id = setTimeout(() => {
      searchCities(q).then((r) => {
        setHits(r);
        setBusy(false);
      });
    }, 350);
    return () => {
      clearTimeout(id);
      setBusy(false);
    };
  }, [q]);

  async function choose(c: SavedCity | null) {
    await setSavedCity(c);
    setCurrent(c);
    setQ("");
    setHits([]);
    showToast(c ? `${t("city_set")} ${c.name}` : t("city_cleared"));
  }

  return (
    <>
      <Text style={[styles.hint, { color: theme.muted }]}>{t("city_hint")}</Text>
      <Row>
        <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>
          {current ? current.name : t("city_device")}
        </Text>
        {current && (
          <Pressable onPress={() => choose(null)} hitSlop={12}>
            <Text style={{ color: theme.danger, fontSize: 13 }}>{t("city_use_device")}</Text>
          </Pressable>
        )}
      </Row>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={t("city_search_ph")}
        placeholderTextColor={theme.muted}
        autoCorrect={false}
        style={[styles.input, { borderColor: theme.line, backgroundColor: theme.surface, color: theme.text }]}
      />
      {busy && <ActivityIndicator color={theme.accent} style={{ marginTop: 10 }} />}
      {hits.map((c) => (
        <Pressable key={`${c.name}${c.latitude}${c.longitude}`} onPress={() => choose(c)}>
          <Row>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontSize: 15 }}>{c.name}</Text>
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                {[c.admin, c.country].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </Row>
        </Pressable>
      ))}
    </>
  );
}

/** Prayer calculation method. There is no universally correct choice — Iraq is
 * religiously mixed — so this is offered rather than decided. */
export function PrayerMethodPanel() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { showToast } = useToast();
  const [method, setMethod] = useState<number | null>(null);

  useEffect(() => {
    getPrayerMethod().then(setMethod);
  }, []);

  return (
    <>
      <Text style={[styles.hint, { color: theme.muted }]}>{t("prayer_method_hint")}</Text>
      {PRAYER_METHODS.map((m) => {
        const on = method === m.id;
        return (
          <Pressable
            key={m.id}
            onPress={async () => {
              await setPrayerMethod(m.id);
              setMethod(m.id);
              showToast(t("saved_toast"));
            }}
          >
            <View
              style={[
                styles.row,
                { backgroundColor: theme.surface, borderColor: on ? theme.accent : theme.line },
              ]}
            >
              <Text style={{ color: theme.text, fontSize: 15, flex: 1 }}>{t(m.key)}</Text>
              {on && <Text style={{ color: theme.accent, fontSize: 15, fontWeight: "800" }}>✓</Text>}
            </View>
          </Pressable>
        );
      })}
    </>
  );
}

/** A window where reminders stay silent. The item still exists and still shows
 * in the app — it just doesn't buzz in the middle of the night. */
export function QuietHoursPanel() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { showToast } = useToast();
  const [quiet, setQuiet] = useState<QuietHours | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getQuietHours().then((q) => {
      setQuiet(q);
      setLoaded(true);
    });
  }, []);

  async function save(next: QuietHours | null) {
    await setQuietHours(next);
    setQuiet(next);
    showToast(t("saved_toast"));
  }

  if (!loaded) return <ActivityIndicator color={theme.accent} style={{ marginTop: 14 }} />;

  return (
    <>
      <Text style={[styles.hint, { color: theme.muted }]}>{t("quiet_hint")}</Text>
      {!quiet ? (
        <Pressable onPress={() => save({ start: "22:00", end: "07:00" })}>
          <Row>
            <Text style={{ color: theme.accent, fontSize: 15 }}>{t("quiet_enable")}</Text>
          </Row>
        </Pressable>
      ) : (
        <>
          <Row>
            <Text style={{ color: theme.text, fontSize: 15, width: 60 }}>{t("quiet_from")}</Text>
            <View style={{ flex: 1 }}>
              <DateTimeField
                mode="time"
                value={quiet.start}
                placeholder="22:00"
                onChange={(v) => save({ ...quiet, start: v || "22:00" })}
              />
            </View>
          </Row>
          <Row>
            <Text style={{ color: theme.text, fontSize: 15, width: 60 }}>{t("quiet_to")}</Text>
            <View style={{ flex: 1 }}>
              <DateTimeField
                mode="time"
                value={quiet.end}
                placeholder="07:00"
                onChange={(v) => save({ ...quiet, end: v || "07:00" })}
              />
            </View>
          </Row>
          <Pressable onPress={() => save(null)}>
            <Row>
              <Text style={{ color: theme.danger, fontSize: 15 }}>{t("quiet_disable")}</Text>
            </Row>
          </Pressable>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Matches SettingsSheet's `row` exactly — these panels push in from that
  // sheet, so any difference in padding reads as the layout shifting under you.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: type.md,
    marginBottom: space.md,
  },
  hint: { fontSize: type.base, lineHeight: 19, marginBottom: space.md },
});
