import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { I18N, Lang } from "./strings";

const STORAGE_KEY = "uiLang";
const RTL_RE = /[؀-ۿݐ-ݿ]/;

export function isRtlText(text: string) {
  return RTL_RE.test(text);
}

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  chromeRtl: boolean; // true when the whole UI (labels/headers) should read right-to-left
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === "en" || saved === "ar" || saved === "ku") setLangState(saved);
    });
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem(STORAGE_KEY, l).catch(() => {});
  };

  const value = useMemo<I18nContextValue>(() => {
    const dict = I18N[lang] || I18N.en;
    return {
      lang,
      setLang,
      t: (key: string) => dict[key] ?? key,
      chromeRtl: lang !== "en",
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
