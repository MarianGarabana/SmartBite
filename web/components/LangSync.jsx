"use client";
// Reads the language choice once the page is in the browser (lib/i18n.js) and keeps <html lang>, the hidden-page
// class and the tab title in step with it. Rendered once, in app/layout.js.
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect } from "react";
import { LANG_KEY, WAIT_CLASS, preferredLang, setLang, setVariant, translate, useLang } from "../lib/i18n";
import { onStoreChange, readCountry } from "../lib/store";
import { ES } from "../lib/i18n/es";

// Spanish title -> English title, to put the English one back when the switch goes to English
const EN_TITLE = Object.fromEntries(Object.entries(ES).filter(([en]) => en.endsWith(" - SmartBite") || en.startsWith("SmartBite - "))
  .map(([en, es]) => [es, en]));

export default function LangSync() {
  const lang = useLang();
  const path = usePathname();
  // Before paint: switch to the stored or browser language, then show the page the inline script hid
  useLayoutEffect(() => {
    setVariant(readCountry()); // Mexico's names when the Profile country is MX
    setLang(preferredLang());
    document.documentElement.classList.remove(WAIT_CLASS);
    const country = onStoreChange(() => setVariant(readCountry()));
    // Another tab changed the language: follow it
    const other = (e) => e.key === LANG_KEY && setLang(preferredLang());
    window.addEventListener("storage", other);
    return () => {
      window.removeEventListener("storage", other);
      country();
    };
  }, []);
  // Tab title: the server writes it in English (page metadata); Next.js may write it again after a navigation
  useEffect(() => {
    const fix = () => {
      const en = EN_TITLE[document.title] || document.title;
      const want = translate(en, null, lang);
      if (document.title !== want) document.title = want;
    };
    fix();
    const head = document.querySelector("head");
    const watch = new MutationObserver(fix);
    watch.observe(head, { subtree: true, childList: true, characterData: true });
    return () => watch.disconnect();
  }, [lang, path]);
  return null;
}
