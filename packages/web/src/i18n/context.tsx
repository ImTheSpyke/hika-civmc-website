import React, { createContext, useContext, useState } from "react";
import { availableLocales, translate } from "./index.js";

interface I18nContextValue {
  locale: string;
  setLocale: (l: string) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  availableLocales: string[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectLocale(): string {
  const stored = localStorage.getItem("locale");
  if (stored && availableLocales.includes(stored)) return stored;
  const browser = navigator.language.split("-")[0];
  if (availableLocales.includes(browser)) return browser;
  return "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<string>(detectLocale);

  function setLocale(l: string) {
    setLocaleState(l);
    localStorage.setItem("locale", l);
  }

  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, availableLocales }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be inside LanguageProvider");
  return ctx;
}
