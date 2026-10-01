import { normDigits } from "./nlp";

// ---------------- qa_maths ----------------
// Deliberately narrow: only digits + +-*/^ and a handful of English operator
// words. No eval() on arbitrary text — build a small numeric expression from
// recognized tokens only, so there's nothing unsafe to execute.
const WORD_OPS: [RegExp, string][] = [
  [/\bplus\b|\badded to\b/gi, "+"],
  [/\bminus\b|\bsubtract(?:ed)?\b/gi, "-"],
  [/\btimes\b|\bmultiplied by\b|\bmultiply(?:ed)? by\b/gi, "*"],
  [/\bdivided by\b|\bover\b/gi, "/"],
  [/\bpercent of\b|% of/gi, "%OF"],
];

function tokenize(text: string): string | null {
  let s = " " + normDigits(text).toLowerCase() + " ";
  for (const [re, sym] of WORD_OPS) s = s.replace(re, ` ${sym} `);
  // keep only digits, ., and recognized operators/spaces — reject anything else
  const cleaned = s.replace(/what('| i)?s|calculate|what is|equals?|\?/g, " ");
  if (!/^[\s\d.+\-*/^%OF]*$/.test(cleaned.replace(/%OF/g, ""))) return null;
  const expr = cleaned.trim();
  return expr || null;
}

function safeEval(expr: string): number | null {
  const pctOf = expr.match(/^([\d.]+)\s*%OF\s*([\d.]+)$/);
  if (pctOf) return (parseFloat(pctOf[1]) / 100) * parseFloat(pctOf[2]);
  // single binary op only (a op b) — enough for "5 plus 3", "12 * 4" etc.
  const m = expr.match(/^([\d.]+)\s*([+\-*/])\s*([\d.]+)$/);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[3]);
  switch (m[2]) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? null : a / b;
  }
  return null;
}

export function answerMaths(text: string): string | null {
  const expr = tokenize(text);
  if (!expr) return null;
  const result = safeEval(expr);
  if (result == null) return null;
  const rounded = Math.round(result * 1e6) / 1e6;
  return `${rounded}`;
}

// ---------------- datetime_convert ----------------
// Scoped to named zones/offsets we can resolve deterministically (no city ->
// timezone database here — that needs a geocoding service this app doesn't
// have). Unresolvable requests get an honest "I can't do that yet" reply
// rather than a guess.
const ZONES: Record<string, number> = {
  utc: 0,
  gmt: 0,
  bst: 1,
  cet: 1,
  cest: 2,
  eet: 2,
  est: -5,
  edt: -4,
  cst: -6,
  cdt: -5,
  mst: -7,
  mdt: -6,
  pst: -8,
  pdt: -7,
  ist: 5.5, // India Standard Time
  gst: 4, // Gulf Standard Time
  irst: 3.5, // Iran
  "baghdad time": 3,
};

function findZone(text: string): { name: string; offset: number } | null {
  const low = text.toLowerCase();
  const explicit = low.match(/\b(?:utc|gmt)\s*([+-]\d{1,2})\b/);
  if (explicit) return { name: `UTC${explicit[1]}`, offset: parseInt(explicit[1], 10) };
  for (const name of Object.keys(ZONES)) {
    if (low.includes(name)) return { name: name.toUpperCase(), offset: ZONES[name] };
  }
  return null;
}

export function answerDatetimeConvert(text: string): string | null {
  const zone = findZone(text);
  if (!zone) return null;
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const target = new Date(utcMs + zone.offset * 3600000);
  const hh = String(target.getHours()).padStart(2, "0");
  const mm = String(target.getMinutes()).padStart(2, "0");
  return `It's ${hh}:${mm} in ${zone.name} right now.`;
}
