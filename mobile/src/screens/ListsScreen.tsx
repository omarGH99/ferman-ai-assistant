import React from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusPill } from "../components/common/StatusPill";
import { useTheme } from "../theme/ThemeProvider";
import { radius, shade, space, tracking, type, weight } from "../theme/tokens";
import { useI18n } from "../i18n/I18nProvider";
import { isRtlText } from "../i18n/I18nProvider";
import { useAppState } from "../state/StateProvider";
import { useSheets } from "../ui/SheetsProvider";
import { useToast } from "../ui/ToastProvider";
import { ShareControls } from "../components/sheets/ShareControls";
import { AddToListRow } from "../components/sheets/AddToListRow";
import { useExcelImport } from "../utils/excelImport";
import { Icon } from "../ui/Icon";
import { callNumber, whatsappNumber } from "../services/deepLinks";
import { EventItem } from "../state/types";
import { recurLabel, todayISO } from "../utils/date";

type Tab = "tasks" | "reminders" | "alarms" | "shopping" | "contacts";

// A "reminder" is a scheduled item (has a time or repeats); everything else is
// a plain task/to-do. Derived so no data migration is needed.
function isReminder(e: EventItem): boolean {
  return !!(e.time || e.recur);
}

// Alarms were already tagged — alarm_set writes kind:"alarm" — but nothing ever
// split on it, so 1,774 rows of training data landed in the reminders tab with
// no surface of their own.
function isAlarm(e: EventItem): boolean {
  return e.kind === "alarm";
}

function EventLine({ e, done }: { e: EventItem; done: boolean }) {
  const { theme } = useTheme();
  const st = useAppState();
  const { openEvent } = useSheets();
  const suffix = e.time ? " · " + e.time : "";
  const when = e.recur ? " " + recurLabel(e) : e.date && e.date !== todayISO() ? " · " + e.date : "";

  return (
    <View style={[styles.item, shade(theme, "sm"), { backgroundColor: theme.surface, borderColor: theme.line }]}>
      <Pressable style={styles.itemText} onPress={() => openEvent(e.id)}>
        <Text
          style={{
            color: done ? theme.muted : theme.text,
            textDecorationLine: done ? "line-through" : "none",
            writingDirection: isRtlText(e.title) ? "rtl" : "ltr",
          }}
        >
          {e.title}
          {suffix}
          {when}
        </Text>
      </Pressable>
      {!done ? (
        <>
          <StatusPill status={e.status} />
          <Pressable
            style={[styles.doneBtn, { backgroundColor: theme.soft }]}
            onPress={() => st.setEventStatus(e.id, "done")}
            hitSlop={12}
          >
            <Text style={{ color: theme.accent, fontSize: 13 }}>✓</Text>
          </Pressable>
        </>
      ) : (
        <Pressable onPress={() => st.setEventStatus(e.id, "pending")} hitSlop={14}>
          <Text style={{ color: theme.muted, fontSize: 15, marginLeft: "auto" }}>↩</Text>
        </Pressable>
      )}
    </View>
  );
}

function ShoppingLine({ index }: { index: number }) {
  const { theme } = useTheme();
  const st = useAppState();
  const item = st.shopping[index];
  return (
    <View style={[styles.item, shade(theme, "sm"), { backgroundColor: theme.surface, borderColor: theme.line }]}>
      <Pressable
        style={[styles.cbx, { borderColor: theme.line, backgroundColor: item.checked ? theme.accent : "transparent" }]}
        onPress={() => st.toggleShoppingChecked(index)}
        hitSlop={14}
      >
        {item.checked ? <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text> : null}
      </Pressable>
      <Text
        style={{
          flex: 1,
          color: item.checked ? theme.muted : theme.text,
          textDecorationLine: item.checked ? "line-through" : "none",
          writingDirection: isRtlText(item.name) ? "rtl" : "ltr",
        }}
      >
        {item.name}
      </Text>
      <Pressable onPress={() => st.removeShoppingAt(index)} hitSlop={14}>
        <Text style={{ color: theme.muted, fontSize: 17, paddingHorizontal: 4 }}>×</Text>
      </Pressable>
    </View>
  );
}

export function ListsScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { listsTab: tab, setListsTab: setTab } = useSheets();
  const insets = useSafeAreaInsets();
  // "" is the default list; named lists come from what users typed.
  const [listName, setListName] = React.useState("");
  const st = useAppState();
  const { showToast } = useToast();
  const { importFromDevice } = useExcelImport();

  // Import lived in the calendar toolbar, next to a date navigator, even
  // though what it produces are tasks. It belongs where they land.
  async function onImport() {
    try {
      const n = await importFromDevice();
      if (n == null) return; // cancelled
      showToast(`${t("imported")} ${n}`);
    } catch {
      showToast(t("import_failed"));
    }
  }

  const byWhen = (a: EventItem, b: EventItem) =>
    (a.date || "") + (a.time || "") < (b.date || "") + (b.time || "") ? -1 : 1;

  function renderEvents(kind: "tasks" | "reminders" | "alarms") {
    const items =
      kind === "alarms"
        ? st.events.filter(isAlarm)
        : st.events.filter((e) => !isAlarm(e) && isReminder(e) === (kind === "reminders"));
    const active = items.filter((e) => e.status !== "done").sort(byWhen);
    const done = items.filter((e) => e.status === "done");
    const emptyKey = kind === "tasks" ? "no_tasks" : kind === "alarms" ? "no_alarms" : "no_reminders";

    return (
      <>
        {active.length ? (
          active.map((e) => <EventLine key={e.id} e={e} done={false} />)
        ) : (
          <Text style={[styles.empty, { color: theme.muted }]}>{t(emptyKey)}</Text>
        )}

        {done.length > 0 && (
          <>
            <Text style={[styles.groupTitle, { color: theme.muted, marginTop: 16 }]}>{t("completed")}</Text>
            {done.map((e) => <EventLine key={e.id} e={e} done />)}
          </>
        )}
      </>
    );
  }

  function renderShopping() {
    // Every distinct list name in use, default first. The model was trained on
    // "add X to my Y list", so the names come from what people actually said
    // rather than from a list they had to create up front.
    const names = Array.from(
      new Set(st.shopping.map((x) => (x.list || "").trim()).filter(Boolean))
    ).sort();
    const inList = (i: number) => (st.shopping[i].list || "").trim() === listName;
    const idx = st.shopping.map((_, i) => i).filter(inList);
    const active = idx.filter((i) => !st.shopping[i].checked);
    const checked = idx.filter((i) => st.shopping[i].checked);

    return (
      <>
        {names.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listChips}
          >
            {["", ...names].map((n) => {
              const on = n === listName;
              return (
                <Pressable
                  key={n || "__default"}
                  onPress={() => setListName(n)}
                  style={[
                    styles.listChip,
                    { borderColor: on ? theme.accent : theme.line, backgroundColor: on ? theme.soft : theme.surface },
                  ]}
                >
                  <Text style={{ color: on ? theme.accent : theme.muted, fontSize: 12 }}>
                    {n || t("list_default")}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {!idx.length && <Text style={[styles.empty, { color: theme.muted }]}>{t("shopping_empty")}</Text>}
        {active.map((i) => <ShoppingLine key={i} index={i} />)}
        {checked.length > 0 && (
          <>
            <Text style={[styles.groupTitle, { color: theme.muted, marginTop: 16 }]}>{t("completed")}</Text>
            {checked.map((i) => <ShoppingLine key={i} index={i} />)}
          </>
        )}
        <Pressable
          style={[styles.clearBtn, { borderColor: theme.line, marginTop: 14 }]}
          onPress={() => {
            const before = st.shopping;
            st.clearCheckedShopping();
            showToast(t("cleared"), { label: t("undo"), onPress: () => st.restoreShopping(before) });
          }}
        >
          <Text style={{ color: theme.muted }}>{t("clear_checked")}</Text>
        </Pressable>
        <Pressable
          style={[styles.clearBtn, { borderColor: theme.line, marginTop: 8 }]}
          onPress={() => {
            const before = st.shopping;
            st.clearShopping();
            showToast(t("cleared"), { label: t("undo"), onPress: () => st.restoreShopping(before) });
          }}
        >
          <Text style={{ color: theme.muted }}>{t("clear_shopping")}</Text>
        </Pressable>
      </>
    );
  }

  function renderContacts() {
    if (!st.contacts.length) {
      return <Text style={[styles.empty, { color: theme.muted }]}>{t("no_contacts")}</Text>;
    }
    return (
      <>
        {st.contacts.map((c) => (
          <View key={c.id} style={[styles.item, shade(theme, "sm"), { backgroundColor: theme.surface, borderColor: theme.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, writingDirection: isRtlText(c.name) ? "rtl" : "ltr" }}>
                {c.name}
              </Text>
              {!!c.phone && (
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>{c.phone}</Text>
              )}
            </View>
            {!!c.phone && (
              <>
                <Pressable onPress={() => callNumber(c.phone)} hitSlop={12} accessibilityLabel={t("call")}>
                  <Text style={{ color: theme.accent, fontSize: 15, paddingHorizontal: 6 }}>✆</Text>
                </Pressable>
                <Pressable onPress={() => whatsappNumber(c.phone)} hitSlop={12} accessibilityLabel="WhatsApp">
                  <Icon name="chat" size={16} color={theme.accent} />
                </Pressable>
              </>
            )}
            <Pressable
              onPress={() => {
                const before = st.contacts;
                st.removeContact(c.id);
                showToast(t("deleted"), { label: t("undo"), onPress: () => st.restoreContacts(before) });
              }}
              hitSlop={14}
            >
              <Text style={{ color: theme.muted, fontSize: 17, paddingHorizontal: 4 }}>×</Text>
            </Pressable>
          </View>
        ))}
      </>
    );
  }

  // What the Share button sends: the visible, unfinished items of the open tab.
  function shareItems() {
    if (tab === "shopping") {
      return st.shopping.filter((x) => !x.checked).map((x) => ({ name: x.name }));
    }
    const want = tab === "reminders";
    return st.events
      .filter((e) => isReminder(e) === want && e.status !== "done")
      .map((e) => ({
        title: e.title,
        date: e.date,
        time: e.time,
        recur: e.recur,
        notes: e.notes,
        kind: e.kind || "reminder",
      }));
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "tasks", label: t("tab_tasks") },
    { key: "reminders", label: t("tab_reminders") },
    { key: "alarms", label: t("tab_alarms") },
    { key: "shopping", label: t("tab_shopping") },
    { key: "contacts", label: t("tab_contacts") },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={[styles.screen, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.tabs, { backgroundColor: theme.chip }]}
      >
        {TABS.map((tb) => {
          const selected = tb.key === tab;
          return (
            <Pressable
              key={tb.key}
              style={[styles.tab, selected && { backgroundColor: theme.surface }]}
              onPress={() => setTab(tb.key)}
            >
              <Text style={{ color: selected ? theme.accent : theme.muted, fontWeight: selected ? "700" : "500", fontSize: 13 }}>
                {tb.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <AddToListRow tab={tab} list={tab === "shopping" ? listName : undefined} />

      {/* Shares whatever the open tab is showing, minus anything already done —
          sending someone a list of finished chores helps nobody. Kept above the
          items: below them it sat past twenty rows of scrolling. */}
      {/* Sharing covers the three list kinds the backend accepts. Alarms are
          device-specific and contacts are other people's details — neither
          belongs in a link you paste into a group chat. */}
      {(tab === "tasks" || tab === "reminders" || tab === "shopping") && (
        <ShareControls kind={tab} items={shareItems()} />
      )}

      {(tab === "tasks" || tab === "reminders") && (
        <Pressable
          style={[styles.clearBtn, { borderColor: theme.line, marginTop: 10, flexDirection: "row", gap: 8 }]}
          onPress={onImport}
        >
          <Icon name="import" size={15} color={theme.muted} />
          <Text style={{ color: theme.muted }}>{t("excel")}</Text>
        </Pressable>
      )}

      {tab === "tasks" && renderEvents("tasks")}
      {tab === "reminders" && renderEvents("reminders")}
      {tab === "alarms" && renderEvents("alarms")}
      {tab === "shopping" && renderShopping()}
      {tab === "contacts" && renderContacts()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.md, paddingTop: space.md },
  tabs: { flexDirection: "row", borderRadius: radius.md, padding: space.xs, marginBottom: space.lg, gap: space.xs },
  tab: { alignItems: "center", paddingVertical: space.sm, paddingHorizontal: space.lg, borderRadius: radius.sm },
  // Matches the feed card's header treatment, so a group of tasks here reads as
  // the same kind of label as a card title over there.
  groupTitle: {
    fontSize: type.xs,
    textTransform: "uppercase",
    letterSpacing: tracking.wide,
    fontWeight: weight.semibold,
    marginBottom: space.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  itemText: { flex: 1 },
  doneBtn: { width: 26, height: 26, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  cbx: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  // Not italic — see FeedMuted: Arabic and Kurdish have no italic form and get
  // slanted mechanically, which looks like a rendering fault.
  empty: { fontSize: type.base, paddingVertical: space.xl, textAlign: "center" },
  listChips: { flexDirection: "row", gap: space.sm, marginBottom: space.md },
  listChip: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  clearBtn: { borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md, alignItems: "center" },
});
