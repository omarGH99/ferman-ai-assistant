import React, { useRef } from "react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { useI18n } from "../i18n/I18nProvider";
import { useChat, ChatMessage } from "../state/ChatProvider";
import { useActions } from "../utils/actions";
import { useAppState } from "../state/StateProvider";
import { useAuth } from "../state/AuthProvider";
import { useToast } from "../ui/ToastProvider";
import { parseCommand, withSlowNotice } from "../services/api";
import { collect, correctCommand } from "../services/auth";
import { extractNotes, parseWhen, cleanTitle } from "../utils/nlp";
import { timeStrTo24 } from "../utils/datetime";
import { EventItem, Slots } from "../state/types";
import { CONFIRM, NONE_INTENT, OOS } from "../utils/constants";
import { UserBubble } from "../components/chat/UserBubble";
import { BotBubble, ModelLine } from "../components/chat/BotBubble";
import { ReminderCard, CardEdit } from "../components/chat/ReminderCard";
import { WelcomeChips } from "../components/chat/WelcomeChips";
import { Composer } from "../components/chat/Composer";

// Intents that create a scheduled item → confirm with an editable card first.
const REMINDER_INTENTS = new Set(["calendar_set", "alarm_set"]);

export function AssistantScreen() {
  const { theme } = useTheme();
  const { t } = useI18n();
  const { messages, addUser, addBot, updateMessage, clearChat } = useChat();
  const { act } = useActions();
  const st = useAppState();
  const { user, token } = useAuth();
  const { showToast } = useToast();
  const listRef = useRef<FlatList>(null);

  function onClear() {
    if (!messages.length) return;
    clearChat();
    showToast(t("chat_cleared"));
  }

  // Opt-in only: the server also enforces consent, so this is belt-and-braces.
  // Resolves to the stored row's id so a later correction updates that row
  // instead of creating a second copy of the same utterance.
  async function maybeCollect(payload: {
    text: string;
    intent?: string | null;
    confidence?: number | null;
  }): Promise<number | null> {
    if (token && user?.consent_data_collection) {
      return collect(token, { lang: "auto", ...payload });
    }
    return null;
  }

  // A tap on the candidates row. It does two things: records the only ground
  // truth this app produces (the model's own prediction is not a label), and
  // actually runs the command as the corrected intent. The second part is what
  // makes the row worth tapping — otherwise picking "alarm set" would look like
  // it should do something and then visibly do nothing.
  function applyCorrection(msg: ChatMessage, intent: string) {
    updateMessage(msg.id, { corrected: intent });
    if (token && msg.collectId != null) {
      correctCommand(token, msg.collectId, intent);
    }
    // NONE_INTENT means "none of these fit", so there is nothing to run.
    if (intent === NONE_INTENT || !msg.sourceText) return;
    runIntent(intent, msg.sourceText, msg.note || "", msg.slots || {}, addBot);
  }

  /** Carry out a settled intent, emitting the reply through `emit` (which either
   * reuses the "waking up" bubble or appends a new one). Returns the bubble id. */
  async function runIntent(
    intent: string,
    clean: string,
    note: string,
    slots: Slots,
    emit: (msg: Omit<ChatMessage, "id" | "role">) => string
  ): Promise<string> {
    // Reminder / alarm. When we detected a concrete date/time (or recurrence)
    // and nothing already occupies that slot, save it straight away with a ✓
    // summary — no confirmation box. The editable card only appears when the
    // request is vague (no date/time) or the chosen time is already taken.
    if (REMINDER_INTENTS.has(intent)) {
      const when = parseWhen(clean, slots);
      const title = cleanTitle(clean, slots);
      const kind = intent === "alarm_set" ? "alarm" : "reminder";
      const clash = when.recur ? null : findConflict(when.date, when.time);
      if (when.matched && !clash) {
        st.addEvent({
          title,
          date: when.recur ? null : when.date,
          time: when.time,
          recur: when.recur,
          notes: note || "",
          kind,
        });
        return emit({
          text: "",
          card: { status: "saved", kind, title, date: when.date, time: when.time, recur: when.recur, note },
        });
      }
      return emit({
        text: "",
        card: {
          status: "pending",
          kind,
          title,
          date: when.matched ? when.date : null,
          time: when.time,
          recur: when.recur,
          note,
        },
      });
    }

    const [reply, isAction] = await act(clean, intent, slots, note);
    return emit({ text: reply, isAction });
  }

  async function handle(text: string) {
    text = (text || "").trim();
    if (!text) return;
    addUser(text);
    const { clean, note } = extractNotes(text);

    // Show a cold-start notice only if the request is actually slow, then
    // replace that same bubble with the answer so the thread stays clean.
    let wakingId: string | null = null;
    const res = await withSlowNotice(parseCommand(clean), () => {
      wakingId = addBot({ text: t("waking_up"), isAction: false });
    });
    const say = (msg: Omit<ChatMessage, "id" | "role">) => {
      let id: string;
      if (wakingId) {
        updateMessage(wakingId, { card: undefined, ...msg });
        id = wakingId;
      } else {
        id = addBot(msg);
      }
      wakingId = null;
      return id;
    };
    const conf = res.confidence;
    const slots = res.slots || {};
    const candidates = res.candidates || [];

    // Log the command, then attach the stored row's id to the bubble so a tap on
    // the candidates row labels that same row rather than creating a new one.
    const record = (botId: string, intent: string | null) => {
      maybeCollect({ text: clean, intent, confidence: conf }).then((id) => {
        if (id != null) updateMessage(botId, { collectId: id });
      });
    };

    // Everything a follow-up tap needs to re-run the command as a different
    // intent: the cleaned text, the extracted note, and the slots.
    const askContext = { candidates, ask: true, sourceText: clean, note, slots };

    // Two kinds of uncertainty, handled separately so they never share a screen:
    //
    //   intent unclear  -> ask which one, act only once it is settled (here)
    //   intent clear,
    //   slot missing/taken -> the editable card (runIntent)
    //
    // Stacking both would put two unrelated questions on one card, and tapping a
    // candidate under a Save button implies the card will change — it wouldn't.

    // 1. Too weak to even offer a best guess. The server suppresses these
    //    (low_confidence); the OOS check still covers the offline mock parser.
    if (res.low_confidence || (conf != null && conf < OOS)) {
      const id = say({ text: t("didnt_catch"), isAction: false, ...askContext });
      record(id, null);
      return;
    }

    // 2. A guess, but not a confident one. Settle the intent before doing
    //    anything: acting on a coin-flip and asking afterwards means the user
    //    has to undo whatever we did. This is also the band where the model is
    //    wrong most often, so these taps are the most valuable labels.
    if (conf != null && conf < CONFIRM) {
      const id = say({ text: t("c_which"), isAction: false, ...askContext, intent: res.intent, confidence: conf });
      record(id, res.intent);
      return;
    }

    // 3. Confident — act. Candidates still travel with the reply so a
    //    confidently wrong answer can be corrected behind the "wrong?" link.
    //    general_quirky is the catch-all class, so its chips open by default:
    //    it is where the model puts what it cannot place, and at 0.8+ confidence
    //    the floor never fires, so it produced no labels at all.
    const catchAll = res.intent === "general_quirky";
    const id = await runIntent(res.intent || "general_quirky", clean, note, slots, (m) =>
      say({ ...m, candidates, sourceText: clean, note, slots, intent: res.intent, confidence: conf, ask: catchAll })
    );
    record(id, res.intent);
  }

  // Returns an existing event that already occupies this exact date + time, so
  // the card can warn instead of double-booking. Recurring items (no fixed date)
  // and finished items are ignored.
  function findConflict(date: string | null, time: string): EventItem | null {
    if (!date || !time.trim()) return null;
    const t24 = timeStrTo24(time);
    if (!t24) return null;
    return (
      st.events.find(
        (e) => e.status !== "done" && e.date === date && e.time && timeStrTo24(e.time) === t24
      ) || null
    );
  }

  function saveCard(msg: ChatMessage, edit: CardEdit) {
    const card = msg.card!;
    st.addEvent({
      title: edit.title,
      date: card.recur ? null : edit.date,
      time: edit.time,
      recur: card.recur,
      notes: card.note || "",
      kind: card.kind,
    });
    updateMessage(msg.id, {
      card: { ...card, status: "saved", title: edit.title, date: edit.date, time: edit.time },
    });
  }

  function cancelCard(msg: ChatMessage) {
    updateMessage(msg.id, { card: { ...msg.card!, status: "cancelled" } });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<WelcomeChips />}
        renderItem={({ item }) =>
          item.role === "user" ? (
            <UserBubble text={item.text} />
          ) : item.card ? (
            <View>
              <ReminderCard
                msg={item}
                findConflict={findConflict}
                onSave={(edit) => saveCard(item, edit)}
                onCancel={() => cancelCard(item)}
              />
              <ModelLine msg={item} />
            </View>
          ) : (
            <BotBubble msg={item} onCorrect={(intent) => applyCorrection(item, intent)} />
          )
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />
      <Composer onSend={handle} onClear={onClear} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 14, paddingBottom: 8, flexGrow: 1 },
});
