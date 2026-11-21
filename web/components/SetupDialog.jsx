"use client";
// Create profile (decided 2026-10-22): a short first-run setup, saved in this browser like the Profile page. Two
// steps (decided 2026-10-31: targets left out, they are set in the Make Your Meal form; no Skip, a key is needed to
// finish): where you shop, your AI key; then "You're set". Close leaves without finishing. Everything else keeps its
// default and is edited in the Profile. Opened from /start, the profile menu, or once on the first "Show me 4 ideas"
// (openSetup). Styles from the Edit product dialog (design freeze). After a profile file is opened without a key the
// setup shows only the key step (keyOnly, decided 2026-11-01); closing it then keeps the file's finished setup.
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { t, tx, useLang } from "../lib/i18n";
import { checkKey } from "../lib/llm";
import { ANTHROPIC, EXPERIMENTAL_LABEL, OPENAI_COMPATIBLE, presetById } from "../lib/providers";
import { COUNTRIES, DEFAULT_COUNTRY, ESTIMATE_CURRENCY, NATIONAL, OTHER_COUNTRY, REGIONS, SETUP_DONE, SETUP_SKIPPED,
  currencyFor, currencySymbol, markSetup, readApiKey, readCountry, readCurrency, readLlmSettings, readOpenAiKey, readRegion,
  writeApiKey, writeCountry, writeCurrency, writeLlmSettings, writeOpenAiKey, writeRegion } from "../lib/store";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2";
const input = "w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest";
const small = "block text-[11px] text-forest/70 mt-1";
const STEPS = ["Where you shop", "Your AI key"];
const SETUP_EVENT = "smartbite-setup";
export const SETUP_DONE_EVENT = "smartbite-setup-done"; // after the setup is finished: forms re-read their defaults
// The tested providers (decided 2026-10-31): Anthropic, and Gemini through its OpenAI-compatible preset. "OpenAI or
// other" (OpenAI, OpenRouter, any OpenAI-compatible endpoint, untested) leads to the Profile, which asks for the model.
const GEMINI = presetById("gemini");
const OTHER = "other";
const KEY_CHOICES = [
  { id: ANTHROPIC, label: "Anthropic (Claude)", field: "Anthropic API key", placeholder: "sk-ant-...", host: "api.anthropic.com",
    getKey: "https://console.anthropic.com/settings/keys", getKeyLabel: "Open the Anthropic Console", site: "the Anthropic Console",
    steps: ["and sign in or create an account.", "Add credit under Billing, then create a key and copy it.", "Paste it here."],
    cost: "Anthropic charges your account for each meal you make." },
  { id: GEMINI.id, label: "Google Gemini", field: "Gemini API key", placeholder: "AIza...", host: new URL(GEMINI.baseUrl).host,
    getKey: "https://aistudio.google.com/apikey", getKeyLabel: "Open Google AI Studio", site: "Google AI Studio",
    steps: ["and sign in with a Google account.", "Press Create API key and copy the key.", "Paste it here."],
    cost: "Free to start: a free key allows a limited number of calls per day." },
  { id: OTHER, label: "OpenAI or other" },
];

// Country and currency names in the page language (lib/store.js has them in English from the browser's Intl data).
// Spanish: Intl names in Spanish, sorted in Spanish, "Other country" last; English: as given. Used here and on Profile.
const intlName = (type, code) => {
  try { return new Intl.DisplayNames(["es"], { type }).of(code) || null; } catch { return null; }
};
export function countryText(c, lang) {
  if (!c) return "";
  if (c.id === OTHER_COUNTRY) return t(c.label);
  return lang === "es" ? intlName("region", c.id) || c.label : c.label;
}
export function countryOptions(list, lang) {
  const out = list.map((c) => ({ id: c.id, label: countryText(c, lang) }));
  if (lang !== "es") return out;
  const other = out.filter((c) => c.id === OTHER_COUNTRY);
  return [...out.filter((c) => c.id !== OTHER_COUNTRY).sort((a, b) => a.label.localeCompare(b.label, "es")), ...other];
}
// "Euro (€)" -> "euro (€)"
export function currencyOptions(list, lang) {
  if (lang !== "es") return list;
  return list.map((c) => {
    const name = intlName("currency", c.id);
    const symbol = c.label.match(/\(([^()]*)\)$/)?.[1];
    return { id: c.id, label: name ? `${name}${symbol ? ` (${symbol})` : ""}` : c.label };
  }).sort((a, b) => a.label.localeCompare(b.label, "es"));
}

// Opens the setup on any page with a header; onClose(state, { profile }) gets "done" or "skipped" when it closes,
// and profile true when the user left through the link to the Profile. { keyOnly: true } shows only the key step.
export function openSetup(onClose, { keyOnly = false } = {}) {
  window.dispatchEvent(new CustomEvent(SETUP_EVENT, { detail: { onClose, keyOnly } }));
}

// Mounted once in the header: listens for openSetup and shows the dialog. The dialog goes to document.body: the
// header's backdrop blur makes it the box that fixed children are placed in, which cut the dialog to 80 px.
export function SetupHost() {
  const [open, setOpen] = useState(null); // { onClose, keyOnly } while the dialog shows
  useEffect(() => {
    const show = (e) => setOpen({ onClose: e.detail?.onClose, keyOnly: Boolean(e.detail?.keyOnly) });
    window.addEventListener(SETUP_EVENT, show);
    return () => window.removeEventListener(SETUP_EVENT, show);
  }, []);
  if (!open) return null;
  const close = (state, opts = {}) => {
    if (!(open.keyOnly && state === SETUP_SKIPPED)) markSetup(state);
    setOpen(null);
    if (state === SETUP_DONE) window.dispatchEvent(new Event(SETUP_DONE_EVENT));
    open.onClose?.(state, opts);
  };
  return createPortal(<SetupDialog onClose={close} keyOnly={open.keyOnly} />, document.body);
}

function SetupDialog({ onClose, keyOnly }) {
  const lang = useLang();
  const [step, setStep] = useState(keyOnly ? 1 : 0);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [region, setRegion] = useState(NATIONAL);
  const [countryList, setCountryList] = useState([]);
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState(ANTHROPIC); // ANTHROPIC or "gemini"
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    setCountry(readCountry());
    setRegion(readRegion());
    setCountryList(COUNTRIES);
    const llm = readLlmSettings();
    const gemini = llm.provider === OPENAI_COMPATIBLE && llm.openai.preset === GEMINI.id;
    // A profile file may bring an untested provider: then the key step points to the Profile, which asks for the model
    setProvider(gemini ? GEMINI.id : keyOnly && llm.provider === OPENAI_COMPATIBLE ? OTHER : ANTHROPIC);
    setKey(gemini ? readOpenAiKey() : readApiKey());
  }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose(SETUP_SKIPPED);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const regions = REGIONS[country] || [];
  const currency = currencyFor(country) || readCurrency(country);
  const next = () => { setError(""); setStep((s) => s + 1); };

  // Each step saves what it shows, then moves on
  const saveShop = () => {
    writeCountry(country);
    if (currencyFor(country)) writeCurrency(currencyFor(country));
    if (regions.length) writeRegion(region);
    next();
  };
  // Switching provider shows that provider's saved key (or none)
  const pickProvider = (id) => {
    setProvider(id);
    setError("");
    setKey(id === ANTHROPIC ? readApiKey() : id === GEMINI.id ? readOpenAiKey() : "");
  };
  const choice = KEY_CHOICES.find((c) => c.id === provider);
  // The key is checked with the provider before it is saved (2026-11-17): a wrong key is caught here, not after the
  // quiz. If the provider cannot be reached the key is saved anyway.
  const saveKey = async () => {
    if (checking) return;
    if (!key.trim()) return setError(t("Paste your key first. No key? Close this and try the demo."));
    setError("");
    setChecking(true);
    const accepted = await checkKey({ provider: provider === ANTHROPIC ? ANTHROPIC : OPENAI_COMPATIBLE, apiKey: key.trim(), baseUrl: GEMINI.baseUrl });
    setChecking(false);
    if (accepted === false) {
      return setError(t("{provider} did not accept this key. Copy the whole key again from {site} and paste it here.", { provider: choice.label, site: t(choice.site) }));
    }
    const settings = readLlmSettings();
    if (provider === ANTHROPIC) {
      writeLlmSettings({ ...settings, provider: ANTHROPIC });
      writeApiKey(key);
    } else {
      writeLlmSettings({ ...settings, provider: OPENAI_COMPATIBLE,
        openai: { preset: GEMINI.id, baseUrl: GEMINI.baseUrl, model: GEMINI.model } });
      writeOpenAiKey(key);
    }
    next();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-forest/40 flex items-center justify-center p-4" onClick={() => onClose(SETUP_SKIPPED)}>
      <div role="dialog" aria-modal="true" aria-labelledby="setup-title" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-8 shadow-card border border-cream-dark max-w-lg w-full space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="font-script text-2xl text-forest font-bold">{step >= STEPS.length ? t("All done") : keyOnly ? t("Profile opened") : t("Step {n} of {total}", { n: step + 1, total: STEPS.length })}</span>
            <h2 id="setup-title" className="font-serif text-3xl font-bold text-forest leading-snug">{step < STEPS.length ? t(STEPS[step]) : t("You're set")}</h2>
          </div>
          {step < STEPS.length && (
            <button onClick={() => onClose(SETUP_SKIPPED)} className="text-xs font-bold text-forest/70 hover:text-forest whitespace-nowrap pt-2">{t("Close")}</button>
          )}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <p className="text-xs text-forest/70">{t("Saved in this browser. No account, nothing sent anywhere.")}</p>
            <div>
              <label htmlFor="setup-country" className={label}>{t("Country")}</label>
              <select id="setup-country" value={country} onChange={(e) => setCountry(e.target.value)} className={input}>
                {countryOptions(countryList.length ? countryList : COUNTRIES.filter((c) => c.id === country), lang).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <span className={small}>{t("Prices show in {currency} ({symbol}). You can change the currency in your Profile.", { currency, symbol: currencySymbol(currency) || currency })}</span>
            </div>
            {regions.length > 0 && ESTIMATE_CURRENCY[country] === currency && (
              <div>
                <label htmlFor="setup-region" className={label}>{t("Region")}</label>
                <select id="setup-region" value={region} onChange={(e) => setRegion(e.target.value)} className={input}>
                  <option value={NATIONAL}>{t("{country} average", { country: countryText(COUNTRIES.find((c) => c.id === country), lang) })}</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <span className={small}>{t("For estimated prices on items you have not priced.")}</span>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {keyOnly && <p id="setup-key-only" className="text-sm text-forest/80">{t("Your profile file is open. It does not include your AI key, so add it here to start.")}</p>}
            <p className="text-xs text-forest/70">
              {choice.host ? t("SmartBite writes ideas and recipes with your own AI key. It is stored only in this browser and sent only to {host}. No key? You can still try the demo.", { host: choice.host })
                : t("SmartBite writes ideas and recipes with your own AI key. It is stored only in this browser. No key? You can still try the demo.")}
            </p>
            <div>
              <span id="setup-provider-label" className={label}>{t("AI provider")}</span>
              <div role="radiogroup" aria-labelledby="setup-provider-label" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {KEY_CHOICES.map((c) => (
                  <button key={c.id} role="radio" aria-checked={provider === c.id} onClick={() => pickProvider(c.id)}
                    className={`rounded-xl p-3 text-sm font-bold border transition-colors ${provider === c.id ? "bg-lime-soft border-forest text-forest" : "bg-cream/50 border-cream-dark text-forest/70 hover:border-forest"}`}>
                    {t(c.label)}
                  </button>
                ))}
              </div>
              {provider === GEMINI.id && <span className={small}>{t(EXPERIMENTAL_LABEL)} {t("Model: {model}.", { model: GEMINI.model })}</span>}
            </div>
            {provider === OTHER ? (
              <p id="setup-other" className="text-xs text-forest/80 bg-cream/50 border border-cream-dark rounded-xl p-3">
                {tx("OpenAI, OpenRouter or another OpenAI-compatible endpoint need a model name too, so they are set up in your {profile}. What you saved in the steps before is kept. Not tested by SmartBite yet: results may vary.", {
                  profile: <Link href="/profile#ai-provider" onClick={() => onClose(SETUP_DONE, { profile: true })} className="font-bold underline hover:text-lime-hover">{t("Profile")}</Link> })}
              </p>
            ) : (
            <div>
              <label htmlFor="setup-key" className={label}>{t(choice.field)}</label>
              <input id="setup-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={choice.placeholder} className={input} />
              <div id="setup-key-help" className="mt-3 bg-cream/50 border border-cream-dark rounded-xl p-3 text-xs text-forest/80 space-y-1.5">
                <p className="font-bold text-forest">{t("No key yet? It takes about 2 minutes:")}</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li><a href={choice.getKey} target="_blank" rel="noopener noreferrer" className="font-bold underline hover:text-lime-hover">{t(choice.getKeyLabel)}</a> {t(choice.steps[0])}</li>
                  <li>{t(choice.steps[1])}</li>
                  <li>{t(choice.steps[2])}</li>
                </ol>
                <p className="text-forest/70">{t(choice.cost)}</p>
              </div>
            </div>
            )}
            {error && <div role="status" className="bg-amber-100 text-amber-900 text-xs rounded-xl p-3">{error}</div>}
          </div>
        )}

        {step === 2 && (
          <p className="text-sm text-forest/80">
            {tx("Your profile is saved in this browser. Change anything later in your {profile}, and save a profile file there to keep it or move it to another browser.", {
              profile: <Link href="/profile" onClick={() => onClose(SETUP_DONE, { profile: true })} className="font-bold underline hover:text-lime-hover">{t("Profile")}</Link> })}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {step === 0 && <button onClick={saveShop} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">{t("Next")}</button>}
          {step === 1 && provider !== OTHER && (
            <button onClick={saveKey} disabled={checking} className="bg-lime hover:bg-lime-hover disabled:opacity-60 text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">
              {checking ? t("Checking your key...") : t("Save key")}
            </button>
          )}
          {step === 2 && <button onClick={() => onClose(SETUP_DONE)} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">{t("Make Your Meal")}</button>}
          {step === 1 && !keyOnly && <button onClick={() => { setError(""); setStep(0); }} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2.5">{t("Back")}</button>}
        </div>
      </div>
    </div>
  );
}
