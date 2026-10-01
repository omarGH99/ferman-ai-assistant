import { useAppState } from "../state/StateProvider";
import { useI18n } from "../i18n/I18nProvider";
import { STATUS_LABEL_KEYS } from "../i18n/strings";
import { parseWhen, parseTime, cleanTitle, cleanShoppingItem, findWeekdays } from "./nlp";
import { DOW, todayISO } from "./date";
import { getWeatherReply } from "../services/weather";
import { getCurrencyReply } from "../services/currency";
import { getNews } from "../services/api";
import { answerMaths, answerDatetimeConvert } from "./qa";
import { lookupWiki, WIKI_NAME } from "../services/wiki";
import { composeEmail, openInMaps } from "../services/deepLinks";
import { getSavedCity } from "../services/prefs";
import { EventItem, Slots, Status } from "../state/types";

// Kurdish entries are placeholders pending native-speaker review — same
// spelling-accuracy bar as the training data (see XLMR_dataset_4lang_v2.csv).
const JOKES: Record<string, string[]> = {
  en: [
    "Why did the developer go broke? Because they used up all their cache.",
    "Why do programmers prefer dark mode? Because light attracts bugs.",
  ],
  ar: [
    "لماذا لا يثق المبرمجون بالسلالم؟ لأن لديها دائمًا خطوة غير محسوبة.",
    "لماذا خاف الحاسوب من الشاطئ؟ بسبب الفيروسات!",
  ],
  ku: ["بۆچی کۆمپیوتەر لە دەریا دەترسێت؟ لەبەر ڤایرۆسەکان."],
};

// Fallback replies, by intent, as translation keys.
//
// Half the old map was dead: 25 of its 48 entries were for intents v2 dropped
// (all iot_*, play_*, music_*, social_*, audio_volume_*, plus email_query and
// qa_stock), which the model can no longer emit. Pruned rather than translated.
//
// The wording also stopped calling itself a prototype. Telling a tester "not
// connected in this prototype" on every unsupported request invites "it doesn't
// work" rather than "here is what I wanted".
const REPLY_KEY: Record<string, string> = {
  news_query: "r_news",
  qa_factoid: "r_qa",
  qa_definition: "r_qa",
  qa_maths: "r_maths",
  qa_currency: "r_currency",
  general_joke: "r_joke",
  general_quirky: "r_quirky",
  general_greet: "r_greet",
  recommendation_events: "r_events",
  recommendation_locations: "r_places",
  recommendation_movies: "r_movies",
  takeaway_order: "r_takeaway",
  takeaway_query: "r_takeaway",
  transport_query: "r_transport",
  transport_taxi: "r_taxi",
  transport_ticket: "r_ticket",
  transport_traffic: "r_traffic",
  cooking_recipe: "r_recipe",
  cooking_query: "r_recipe",
  email_sendemail: "r_email",
  email_addcontact: "r_contact_add",
  email_querycontact: "r_contact_find",
};

const CANCEL_KW = ["cancel", "delete", "remove", "الغ", "احذف", "بەتاڵ", "ژێبرن", "بسڕەوە"];
const RESCHED_KW = ["reschedule", "move", "change", "postpone", "غير", "أجل", "بگوهێرە", "گوهاستن"];

export function useActions() {
  const st = useAppState();
  const { t, lang } = useI18n();

  function markStatus(text: string): string | null {
    const low = text.toLowerCase();
    if (!/\b(mark|set|change)\b/.test(low)) return null;
    let status: Status | null = null;
    if (/\bdone|complete|finish/.test(low)) status = "done";
    else if (/\battend/.test(low)) status = "attended";
    else if (/\bin.?progress|started|doing\b/.test(low)) status = "inprogress";
    else if (/\bpending|todo\b/.test(low)) status = "pending";
    if (!status) return null;
    const ev = st.events.find(
      (e) => e.title && low.includes(e.title.toLowerCase().split(" ").slice(0, 2).join(" "))
    );
    if (!ev) return t("a_not_found");
    st.setEventStatus(ev.id, status);
    return `${t("a_marked")} "${ev.title}" — ${t(STATUS_LABEL_KEYS[status])}`;
  }

  function editCommand(text: string, slots?: Slots): string | null {
    const low = text.toLowerCase();
    const wantsCancel = CANCEL_KW.some((k) => low.includes(k));
    const wantsResched = RESCHED_KW.some((k) => low.includes(k));
    if (!wantsCancel && !wantsResched) return null;
    const ev = st.findEventByText(text);
    if (!ev) return null; // no matching event -> let normal handling run
    if (wantsCancel) {
      st.deleteEvent(ev.id);
      return `${t("a_cancelled")} "${ev.title}"`;
    }
    const when = parseWhen(text, slots || {});
    const timeVal = parseTime(text, slots || {});
    const patch: Partial<EventItem> = {};
    const changed: string[] = [];
    if (timeVal) {
      patch.time = timeVal;
      changed.push(`${t("rc_time")} ${timeVal}`);
    }
    if (when.recur) {
      patch.recur = when.recur;
      patch.date = null;
      changed.push(t("a_repeating"));
    } else if (when.date && when.date !== todayISO()) {
      patch.recur = null;
      patch.date = when.date;
      changed.push(`${t("rc_date")} ${when.date}`);
    }
    if (!changed.length) return null;
    st.updateEvent(ev.id, patch);
    return `${t("a_updated")} "${ev.title}" — ${changed.join(", ")}`;
  }

  async function act(text: string, intent: string, slots: Slots, note?: string): Promise<[string, boolean]> {
    const ed = editCommand(text, slots);
    if (ed) return [ed, true];
    const ms = markStatus(text);
    if (ms) return [ms, true];

    if ((intent === "lists_add" || intent === "lists_createoradd") && findWeekdays(text.toLowerCase()).length === 0) {
      const item = slots.list_item || slots.food_type || cleanShoppingItem(text);
      st.addShoppingItem(item);
      return [t("added_shopping") + " " + item, true];
    }
    if (intent === "lists_remove") {
      const item = (slots.list_item || cleanTitle(text, slots)).toLowerCase();
      const removed = st.removeShoppingByText(item);
      return [removed ? t("removed_list") : t("not_on_list"), true];
    }
    if (intent === "lists_query") {
      return [
        st.shopping.length ? t("shopping_list") + " " + st.shopping.map((x) => x.name).join("; ") : t("shopping_empty"),
        false,
      ];
    }
    if (intent === "weather_query") {
      const w = await getWeatherReply(text, t);
      return [w, true];
    }
    if (intent === "alarm_query") {
      const alarms = st.events.filter((e) => e.kind === "alarm" && e.status !== "done");
      return [
        alarms.length
          ? `You have ${alarms.length} alarm(s): ${alarms.map((a) => a.title + (a.time ? " at " + a.time : "")).join("; ")}.`
          : t("no_alarms"),
        false,
      ];
    }
    if (intent === "alarm_remove" || intent === "calendar_remove") {
      const kind = intent === "alarm_remove" ? "alarm" : "reminder";
      const ev = st.findEventByText(text, kind);
      if (ev) {
        st.deleteEvent(ev.id);
        return [`Cancelled "${ev.title}".`, true];
      }
      return [kind === "alarm" ? "I couldn't find that alarm to remove." : "I couldn't find that event to remove.", false];
    }
    if (intent === "general_greet") {
      const h = new Date().getHours();
      const key = h < 12 ? "greet_morning" : h < 18 ? "greet_afternoon" : "greet_evening";
      return [t(key) + "!", false];
    }
    if (intent === "general_joke") {
      const list = JOKES[lang] || JOKES.en;
      return [list[Math.floor(Math.random() * list.length)], false];
    }
    if (intent === "datetime_query") {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      return [`${t("a_time_now")} ${hh}:${mm} · ${todayISO()}`, false];
    }
    if (intent === "datetime_convert") {
      const reply = answerDatetimeConvert(text);
      return [reply || "I can convert a few named time zones (UTC/GMT/EST/PST/IST/GST etc.) but not that one yet.", false];
    }
    if (intent === "qa_currency") {
      const reply = await getCurrencyReply(text);
      return [reply || t("r_currency"), false];
    }
    // Composing an email needs no OAuth — only reading an inbox does. Half of
    // email_sendemail's 1,134 rows become real for the cost of a mailto: URL.
    if (intent === "email_sendemail") {
      const subject = cleanTitle(text, slots) || "";
      await composeEmail(String(slots.person || slots.email_address || ""), subject, note || "");
      return [t("opening_email"), false];
    }

    // Maps knows small local businesses; OpenStreetMap does not — searching it
    // for a named cafe in Duhok returns nothing. So hand the query over rather
    // than trying to answer it here, and add the user's city for disambiguation.
    if (intent === "recommendation_locations") {
      const place = cleanTitle(text, slots) || text;
      const city = await getSavedCity();
      await openInMaps(place, city?.name || "");
      return [t("opening_maps"), false];
    }

    if (intent === "qa_factoid" || intent === "qa_definition") {
      const hit = await lookupWiki(text, lang);
      if (!hit) return [t("wiki_none"), false];
      // Say where it came from when the answer isn't in the asked language —
      // Sorani Wikipedia is small enough that the fallback fires often, and a
      // silent language switch would just look like a bug.
      const asked = lang === "ku" ? ["ckb", "ku"] : [lang];
      const note = asked.includes(hit.wiki)
        ? ""
        : ` (${WIKI_NAME[hit.wiki] || hit.wiki} Wikipedia)`;
      return [`${hit.title}: ${hit.extract}${note}`, false];
    }
    if (intent === "qa_maths") {
      const reply = answerMaths(text);
      return [reply != null ? `That's ${reply}.` : t("r_maths"), false];
    }
    if (intent === "news_query") {
      const news = await getNews(lang);
      return [news.ok && news.items.length ? `${news.items[0].title} (${news.source})` : t("r_news"), false];
    }
    if (
      intent === "calendar_set" ||
      intent === "alarm_set" ||
      intent === "calendar_query" ||
      findWeekdays(text.toLowerCase()).length
    ) {
      if (intent === "calendar_query") {
        return [
          st.events.length ? `${t("a_you_have")} ${st.events.length} — ${t("my_lists")}` : t("a_nothing_yet"),
          false,
        ];
      }
      const when = parseWhen(text, slots);
      const title = cleanTitle(text, slots);
      st.addEvent({ title, date: when.date, time: when.time, recur: when.recur, notes: note || "" });
      const where = when.recur
        ? "every " + when.recur.days.map((js) => DOW[(js + 6) % 7]).join(",")
        : when.date === todayISO()
        ? "today"
        : when.date;
      return [
        `${t("a_added")} ${title}${when.time ? " · " + when.time : ""} · ${where}${note ? " · " + t("a_note_saved") : ""}`,
        true,
      ];
    }
    const key = REPLY_KEY[intent];
    return [key ? t(key) : t("r_quirky"), false];
  }

  return { act, editCommand, markStatus };
}
