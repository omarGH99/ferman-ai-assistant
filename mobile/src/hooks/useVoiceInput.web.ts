import { useCallback, useEffect, useRef, useState } from "react";

// Browser speech-to-text via the Web Speech API (Chrome/Edge, Chrome on Android,
// and recent Safari). No dependency, no key. Kurdish has no browser model, so we
// fall back to Iraqi Arabic recognition for "ku" (both use Arabic script).
const LANG_MAP: Record<string, string> = { en: "en-US", ar: "ar-SA", ku: "ar-IQ" };

export function useVoiceInput(lang: string, onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const SR: any =
    typeof window !== "undefined"
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;
  const supported = !!SR;

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!SR) return;
    try {
      const rec = new SR();
      rec.lang = LANG_MAP[lang] || "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        const text = e.results?.[0]?.[0]?.transcript || "";
        if (text) onResult(text);
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [SR, lang, onResult]);

  useEffect(
    () => () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    },
    []
  );

  return { supported, listening, start, stop };
}
