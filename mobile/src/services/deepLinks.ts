import { Linking } from "react-native";

/** Hand-offs to apps the user already has.
 *
 * None of these need an API key, an account or a rendered map — they open the
 * app that already does the job well, with its own navigation, saved places and
 * signed-in account. Several turn intents the model was trained on from "not
 * connected" into something that actually happens:
 *
 *   email_sendemail (1,134 rows)  -> mailto: opens a draft. Reading an inbox
 *                                   needs OAuth; composing does not.
 *   recommendation_locations (540) -> Maps knows small Iraqi businesses.
 *                                   OpenStreetMap does not: searching it for
 *                                   "espresso lab duhok" returns nothing.
 *   calendar_set                  -> a template link puts the reminder in the
 *                                   user's real calendar, which alerts even
 *                                   when this app's tab is closed.
 */

async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Share text (usually a link) through WhatsApp — how people here actually pass
 * things around. Beats "copy this code and send it somehow". */
export function shareViaWhatsApp(text: string) {
  return open(`https://wa.me/?text=${encodeURIComponent(text)}`);
}

export function shareViaTelegram(url: string, text = "") {
  return open(
    `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
  );
}

export function callNumber(phone: string) {
  return open(`tel:${phone.replace(/\s+/g, "")}`);
}

export function messageNumber(phone: string, body = "") {
  const n = phone.replace(/\s+/g, "");
  return open(body ? `sms:${n}?body=${encodeURIComponent(body)}` : `sms:${n}`);
}

/** WhatsApp needs the number in international form without + or spaces. */
export function whatsappNumber(phone: string, body = "") {
  const n = phone.replace(/[^\d]/g, "");
  return open(`https://wa.me/${n}${body ? `?text=${encodeURIComponent(body)}` : ""}`);
}

export function composeEmail(to = "", subject = "", body = "") {
  const q = [
    subject && `subject=${encodeURIComponent(subject)}`,
    body && `body=${encodeURIComponent(body)}`,
  ]
    .filter(Boolean)
    .join("&");
  return open(`mailto:${encodeURIComponent(to)}${q ? `?${q}` : ""}`);
}

/** Search Maps for a place. `near` is appended because "espresso lab" alone is
 * ambiguous, and we already know the user's city. */
export function openInMaps(query: string, near = "") {
  const q = [query.trim(), near.trim()].filter(Boolean).join(" ");
  return open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
}

export function openInWaze(query: string, near = "") {
  const q = [query.trim(), near.trim()].filter(Boolean).join(" ");
  return open(`https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`);
}

/** "Add to Google Calendar" for a reminder.
 *
 * Times are sent without a trailing Z, which Google reads as local — the app
 * stores wall-clock times with no timezone, so pinning them to UTC would shift
 * every event. An entry with no time becomes an all-day one. */
export function addToGoogleCalendar(title: string, dateISO: string, time = "", notes = "") {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = dateISO.replace(/-/g, "");
  let dates: string;
  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(":").map(Number);
    // Add the hour to a real Date rather than doing (h + 1) % 24: a 23:30 entry
    // would otherwise end at 00:30 on the *same* day, i.e. before it started.
    const start = new Date(dateISO + "T00:00:00");
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const stamp = (d: Date) =>
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(
        d.getMinutes()
      )}00`;
    dates = `${stamp(start)}/${stamp(end)}`;
  } else {
    // All-day events are half-open in Google's format: the end is the next day.
    const next = new Date(dateISO + "T00:00:00");
    next.setDate(next.getDate() + 1);
    const nd = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
    dates = `${ymd}/${nd}`;
  }
  const params = [
    "action=TEMPLATE",
    `text=${encodeURIComponent(title)}`,
    `dates=${dates}`,
    notes ? `details=${encodeURIComponent(notes)}` : "",
  ]
    .filter(Boolean)
    .join("&");
  return open(`https://calendar.google.com/calendar/render?${params}`);
}
