import { normDigits } from "../utils/nlp";

// Live USD exchange rates for the pairs we surface in the feed. open.er-api.com
// is free and keyless; exchangerate.host is a keyless fallback.
export const CURRENCY_PAIRS = ["IQD", "EUR", "TRY", "GBP"] as const;

/** Currencies quoted *against the dinar* in the feed, in display order.
 * The app's users think in IQD, so "1 USD = 1,310 IQD" is the useful direction —
 * "1 USD = 0.87 EUR" is not a number anyone here needs. */
export const IQD_QUOTES = ["USD", "EUR", "TRY", "GBP"] as const;

export interface CurrencyData {
  rates: Record<string, number>; // code -> units per 1 USD
}

/** How many IQD one unit of `code` buys.
 * Rates come back per 1 USD, so cross-rate through USD: IQD/USD ÷ code/USD. */
export function toIQD(rates: Record<string, number>, code: string): number | null {
  const iqd = rates.IQD;
  const per = code === "USD" ? 1 : rates[code];
  if (!iqd || !per) return null;
  return iqd / per;
}

function pick(all: Record<string, number>): Record<string, number> {
  const rates: Record<string, number> = {};
  for (const c of CURRENCY_PAIRS) if (all[c]) rates[c] = all[c];
  return rates;
}

export async function getCurrency(): Promise<CurrencyData | null> {
  try {
    const d = await (await fetch("https://open.er-api.com/v6/latest/USD")).json();
    if (d && d.rates) {
      const rates = pick(d.rates);
      if (Object.keys(rates).length) return { rates };
    }
  } catch {
    // try the fallback below
  }
  try {
    const d = await (
      await fetch("https://api.exchangerate.host/latest?base=USD&symbols=" + CURRENCY_PAIRS.join(","))
    ).json();
    if (d && d.rates) {
      const rates = pick(d.rates);
      if (Object.keys(rates).length) return { rates };
    }
  } catch {
    // both sources failed
  }
  return null;
}

// ---------------- qa_currency chat replies ----------------
// USD is the implicit base (rates above are "units per 1 USD"); all pairs
// convert through it. Keyword lists are intentionally short — this covers
// the 5 currencies already tracked by the feed, not arbitrary world currencies.
const CODE_KEYWORDS: [string, string[]][] = [
  ["USD", ["usd", "dollar", "دولار", "دۆلار"]],
  ["IQD", ["iqd", "dinar", "دينار", "دینار"]],
  ["EUR", ["eur", "euro", "يورو", "یۆرۆ"]],
  ["TRY", ["try", "lira", "ليرة", "لیرە"]],
  ["GBP", ["gbp", "pound", "sterling", "جنيه", "پاوەند"]],
];

function findCurrencyMentions(low: string): { code: string; index: number }[] {
  const hits: { code: string; index: number }[] = [];
  for (const [code, kws] of CODE_KEYWORDS) {
    for (const kw of kws) {
      const idx = low.indexOf(kw);
      if (idx >= 0) {
        hits.push({ code, index: idx });
        break;
      }
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

export async function getCurrencyReply(text: string): Promise<string | null> {
  const low = normDigits(text).toLowerCase();
  const amountMatch = low.match(/\d+(\.\d+)?/);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[0]);

  const mentions = findCurrencyMentions(low);
  if (!mentions.length) return null;
  const from = mentions[0].code;
  const to = mentions[1]?.code || (from === "USD" ? "IQD" : "USD");
  if (from === to) return null;

  const data = await getCurrency();
  if (!data) return "I understood a currency question, but couldn't fetch live rates right now.";
  const rates: Record<string, number> = { USD: 1, ...data.rates };
  if (!rates[from] || !rates[to]) {
    return `I can track USD, IQD, EUR, TRY and GBP right now — not ${from === "USD" || rates[from] ? to : from} yet.`;
  }
  const usdAmount = amount / rates[from];
  const converted = usdAmount * rates[to];
  const rounded = Math.round(converted * 100) / 100;
  return `${amount} ${from} ≈ ${rounded} ${to}.`;
}
