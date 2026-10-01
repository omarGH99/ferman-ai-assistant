import { Lang } from "../i18n/strings";

// Wikipedia lookup for the qa_factoid / qa_definition intents.
//
// Called straight from the client: Wikipedia serves
// `access-control-allow-origin: *` on both the REST and action APIs, so there is
// no CORS reason to proxy it, and going direct keeps this off our own backend
// (which sleeps and would add a cold start to every question).
//
// This is a *lookup*, not question answering. Wikipedia's search matches titles,
// so "how tall is mount everest" finds nothing while "mount everest" finds the
// article — hence the entity extraction below. What comes back is the opening
// paragraph of an article, not an extracted fact, and the UI says as much.

export interface WikiAnswer {
  title: string;
  extract: string;
  url: string;
  wiki: string; // which Wikipedia answered — may differ from the asked language
}

/** Leading phrases that turn a question into a search term. Order matters:
 * longer phrases first so "what is the meaning of" beats "what is". */
const STRIP: Record<string, RegExp[]> = {
  en: [
    /^(?:can you )?tell me (?:about|who|what) (?:is |was |are )?/i,
    /^what(?:'s| is| are| was| were) (?:the )?(?:meaning|definition) of /i,
    /^(?:what|who|where|when)(?:'s| is| was| are| were) (?:a |an |the )?/i,
    /^(?:define|meaning of|definition of|explain) /i,
  ],
  ar: [
    /^(?:من|ما|ماذا)\s+(?:هو|هي|هم)\s+/,
    /^ما\s+(?:معنى|تعريف)\s+/,
    /^(?:أخبرني|احكيلي|حدثني)\s+عن\s+/,
    /^(?:عرّف|عرف)\s+/,
    /^(?:أين|متى)\s+(?:هو|هي|يقع|تقع|كان|كانت)?\s*/,
  ],
  ku: [
    /^(?:بێژە|بێژه)\s+(?:من|مە)\s+(?:دەربارەی|دەرباری|ل\s*دەر)\s+/,
    /^(?:چ|چی|چیە|چییە|کێ|کێیە)\s+/,
    /^(?:مانا|واتای|ماناکەی)\s+/,
  ],
};

/** Question words that come *after* the subject.
 *
 * Kurdish puts them at the end — "هەولێر چیە" is literally "Erbil what-is" — so
 * a leading-only strip left the whole question as the search term and matched
 * a disambiguation page by luck. Arabic and English front their question words,
 * so they need nothing here. */
const STRIP_TRAILING: Record<string, RegExp[]> = {
  en: [],
  ar: [],
  ku: [/\s+(?:چیە|چییە|چی\s*یە|چ\s*یە|کێیە|کێ\s*یە|چەند\s*ە)$/],
};

/** Which Wikipedias to try, in order, for a given UI language.
 *
 * Sorani has ~84k articles against English's ~7.2M, so a Kurdish question about
 * anything but a major topic finds nothing there. Falling through to Kurmanji,
 * then Arabic, then English means an answer in the wrong language rather than no
 * answer — the caller labels it so the switch isn't silent. */
const WIKI_CHAIN: Record<Lang, string[]> = {
  en: ["en"],
  ar: ["ar", "en"],
  ku: ["ckb", "ku", "ar", "en"],
};

/** Human label for a wiki code, used when the answer isn't in the asked language. */
export const WIKI_NAME: Record<string, string> = {
  en: "English", ar: "Arabic", ckb: "Sorani", ku: "Kurmanji",
};

export function extractEntity(question: string, lang: Lang): string {
  let q = (question || "").trim().replace(/[?؟.!]+\s*$/, "");
  for (const re of STRIP[lang] || STRIP.en) {
    const next = q.replace(re, "");
    if (next !== q) {
      q = next.trim();
      break; // one strip is enough; chaining them eats real words
    }
  }
  for (const re of STRIP_TRAILING[lang] || []) {
    const next = q.replace(re, "");
    if (next !== q) {
      q = next.trim();
      break;
    }
  }
  // A leading article survives the question strip ("tell me about the Tigris")
  // and can match the wrong page — "The Tigris" is not "Tigris".
  if (lang === "en") q = q.replace(/^the\s+/i, "");
  return q.trim();
}

async function searchTitle(wiki: string, term: string): Promise<string | null> {
  const url =
    `https://${wiki}.wikipedia.org/w/api.php?action=opensearch` +
    `&search=${encodeURIComponent(term)}&limit=1&namespace=0&format=json&origin=*`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    // opensearch returns [term, [titles], [descriptions], [urls]]
    return Array.isArray(d?.[1]) && d[1].length ? d[1][0] : null;
  } catch {
    return null;
  }
}

async function summary(wiki: string, title: string): Promise<WikiAnswer | null> {
  const url = `https://${wiki}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    // Disambiguation pages list options rather than answering anything.
    if (!d?.extract || d.type === "disambiguation") return null;
    return {
      title: d.title || title,
      extract: trimToSentence(d.extract, 360),
      url: d?.content_urls?.desktop?.page || `https://${wiki}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      wiki,
    };
  } catch {
    return null;
  }
}

/** Cut at a sentence end near the limit so the reply doesn't stop mid-word. */
function trimToSentence(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("۔ "), cut.lastIndexOf("؟ "));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.trimEnd() + "…");
}

export async function lookupWiki(question: string, lang: Lang): Promise<WikiAnswer | null> {
  const term = extractEntity(question, lang);
  if (term.length < 2) return null;
  for (const wiki of WIKI_CHAIN[lang] || WIKI_CHAIN.en) {
    const title = await searchTitle(wiki, term);
    if (!title) continue;
    const found = await summary(wiki, title);
    if (found) return found;
  }
  return null;
}
