"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { messages, type Locale, type MessageKey } from "./messages";
const LocaleContext = createContext({
  locale: "en" as Locale,
  t: (key: MessageKey): string => messages.en[key],
  setLocale: (() => {}) as (locale: Locale) => void,
});
export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  function setLocale(value: Locale) {
    updateLocale(value);
    document.cookie = `ruvora_locale=${value};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = value;
  }
  return (
    <LocaleContext.Provider value={{ locale, setLocale, t: (key) => messages[locale][key] }}>
      {children}
    </LocaleContext.Provider>
  );
}
export const useLocale = () => useContext(LocaleContext);
