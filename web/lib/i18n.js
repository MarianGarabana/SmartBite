// Site language (decided 2026-11-21): English and Spanish, no library. Keys are the English text itself, so the code
// still reads in English: t("Add to cart") is the English text in English and ES["Add to cart"] in Spanish. A text
// with no Spanish entry shows in English (test/i18n.test.mjs fails on any t("...") with no entry).
// Placeholders: t("Added \"{name}\" to cart!", { name }). Plurals are two keys: t(n === 1 ? "{n} pack" : "{n} packs", { n }).
//
// The choice lives in localStorage ("smartbite.lang", like the other smartbite.* keys; no cookie). With none stored,
// the browser language decides (navigator.language starting with "es": Spanish). The server always renders English;
// an inline script in app/layout.js sets <html lang> before paint and hides the page for a Spanish visitor until
// LangSync (components/LangSync.jsx) has switched it, so English never flashes.
//
// Food names: the general foods (English keys like "frozen peas") show in Spanish through foodName(); product names
// the user typed or imported are never translated.
// Namespace import: lib/ modules that import this (day.js, packs.js) are also in the server graph (app/layout.js ->
// lib/demo.js -> meal.js), and Next.js refuses a named import of a client-only hook there. The hooks only run in the browser.
import * as React from "react";
import { canonical } from "./names.js";
import { ES } from "./i18n/es.js";
import { FOODS_ES } from "./i18n/foods-es.js";

export const LANGS = ["en", "es"];
export const LANG_KEY = "smartbite.lang";
export const LANG_NAMES = { en: "English", es: "Español" };
// <html> class while a Spanish page waits for LangSync (app/globals.css hides the body meanwhile)
export const WAIT_CLASS = "lang-wait";

let current = "en"; // English until LangSync reads the choice: the server render and hydration are English
const listeners = new Set();

export const getLang = () => current;
export const okLang = (l) => (LANGS.includes(l) ? l : null);

// The language this browser asked for: the stored choice, else the browser language
export function preferredLang() {
  try {
    const stored = okLang(JSON.parse(window.localStorage.getItem(LANG_KEY) || "null"));
    if (stored) return stored;
  } catch {}
  try {
    return String(window.navigator.language || "").toLowerCase().startsWith("es") ? "es" : "en";
  } catch {
    return "en";
  }
}

// Switch the page language; save: remember it in this browser (the EN/ES switch), not when only reading it
export function setLang(lang, { save = false } = {}) {
  const l = okLang(lang) || "en";
  if (save) {
    try { window.localStorage.setItem(LANG_KEY, JSON.stringify(l)); } catch {}
  }
  if (l === current) return;
  current = l;
  try { document.documentElement.lang = l; } catch {}
  listeners.forEach((f) => f());
}

function subscribe(f) {
  listeners.add(f);
  return () => listeners.delete(f);
}

// The page language for a component; it renders again when the language changes. English on the server and during
// hydration (getServerSnapshot), so the first client render matches the server HTML.
export function useLang() {
  return React.useSyncExternalStore(subscribe, getLang, () => "en");
}

const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

// The text in a language (default: the page language), placeholders filled
export function translate(text, vars, lang = current) {
  return fill(lang === "es" && Object.hasOwn(ES, text) ? ES[text] : text, vars);
}
export const t = (text, vars) => translate(text, vars);

// t() bound to the component's language, for components that name a loop variable t: const tr = useT()
export function useT() {
  const lang = useLang();
  return React.useCallback((text, vars) => translate(text, vars, lang), [lang]);
}

// t() for text with elements inside: tx("Read the {link}.", { link: <a>privacy page</a> }). Returns one fragment.
export function tx(text, vars = {}) {
  const parts = translate(text, null).split(/(\{\w+\})/);
  return React.createElement(React.Fragment, null, ...parts.map((p) => {
    const m = p.match(/^\{(\w+)\}$/);
    return m && m[1] in vars ? vars[m[1]] : p;
  }));
}

// A general food's display name: the Spanish name of a known food in Spanish, else the name as given. Keeps a
// capital first letter when the given name has one ("Chicken breast" -> "Pechuga de pollo").
export function foodName(name, lang = current) {
  if (lang !== "es" || typeof name !== "string" || !name) return name;
  const key = Object.hasOwn(FOODS_ES, name) ? name : canonical(name);
  const es = key && FOODS_ES[key];
  if (!es) return name;
  return name[0] !== name[0].toLowerCase() ? es[0].toUpperCase() + es.slice(1) : es;
}

