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
import { ANTHROPIC, EXPERIMENTAL_LABEL, OPENAI_COMPATIBLE, presetById } from "../lib/providers";
import { COUNTRIES, DEFAULT_COUNTRY, ESTIMATE_CURRENCY, NATIONAL, NO_STORE, REGIONS, SETUP_DONE, SETUP_SKIPPED, STORES,
  currencyFor, currencySymbol, markSetup, readApiKey, readCountry, readCurrency, readLlmSettings, readOpenAiKey, readRegion,
  readStore, writeApiKey, writeCountry, writeCurrency, writeLlmSettings, writeOpenAiKey, writeRegion, writeStore } from "../lib/store";

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
    getKey: "https://console.anthropic.com/settings/keys", getKeyLabel: "Get a key in the Anthropic Console" },
  { id: GEMINI.id, label: "Google Gemini", field: "Gemini API key", placeholder: "AIza...", host: new URL(GEMINI.baseUrl).host,
    getKey: "https://aistudio.google.com/apikey", getKeyLabel: "Get a key in Google AI Studio (has a free tier)" },
  { id: OTHER, label: "OpenAI or other" },
];

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
  const [step, setStep] = useState(keyOnly ? 1 : 0);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [region, setRegion] = useState(NATIONAL);
  const [store, setStore] = useState(NO_STORE);
  const [countryList, setCountryList] = useState([]);
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState(ANTHROPIC); // ANTHROPIC or "gemini"
  const [error, setError] = useState("");
  useEffect(() => {
    setCountry(readCountry());
    setRegion(readRegion());
    setStore(readStore().startsWith("other:") ? NO_STORE : readStore());
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
  const stores = STORES[country] || [];
  const next = () => { setError(""); setStep((s) => s + 1); };

  // Each step saves what it shows, then moves on
  const saveShop = () => {
    writeCountry(country);
    if (currencyFor(country)) writeCurrency(currencyFor(country));
    if (regions.length) writeRegion(region);
    writeStore(store);
    next();
  };
  // Switching provider shows that provider's saved key (or none)
  const pickProvider = (id) => {
    setProvider(id);
    setError("");
    setKey(id === ANTHROPIC ? readApiKey() : id === GEMINI.id ? readOpenAiKey() : "");
  };
  const choice = KEY_CHOICES.find((c) => c.id === provider);
  const saveKey = () => {
    if (!key.trim()) return setError("Paste your key first. No key? Close this and try the demo.");
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
            <span className="font-script text-2xl text-forest font-bold">{step >= STEPS.length ? "All done" : keyOnly ? "Profile opened" : `Step ${step + 1} of ${STEPS.length}`}</span>
            <h2 id="setup-title" className="font-serif text-3xl font-bold text-forest leading-snug">{step < STEPS.length ? STEPS[step] : "You're set"}</h2>
          </div>
          {step < STEPS.length && (
            <button onClick={() => onClose(SETUP_SKIPPED)} className="text-xs font-bold text-forest/70 hover:text-forest whitespace-nowrap pt-2">Close</button>
          )}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <p className="text-xs text-forest/70">Saved in this browser. No account, nothing sent anywhere.</p>
            <div>
              <label htmlFor="setup-country" className={label}>Country</label>
              <select id="setup-country" value={country} onChange={(e) => { setCountry(e.target.value); setStore(NO_STORE); }} className={input}>
                {(countryList.length ? countryList : COUNTRIES.filter((c) => c.id === country)).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <span className={small}>Prices show in {currency} ({currencySymbol(currency) || currency}). You can change the currency in your Profile.</span>
            </div>
            {regions.length > 0 && ESTIMATE_CURRENCY[country] === currency && (
              <div>
                <label htmlFor="setup-region" className={label}>Region</label>
                <select id="setup-region" value={region} onChange={(e) => setRegion(e.target.value)} className={input}>
                  <option value={NATIONAL}>{COUNTRIES.find((c) => c.id === country)?.label} average</option>
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <span className={small}>For estimated prices on items you have not priced.</span>
              </div>
            )}
            <div>
              <label htmlFor="setup-store" className={label}>Supermarket</label>
              <select id="setup-store" value={store} onChange={(e) => setStore(e.target.value)} className={input}>
                <option value={NO_STORE}>No store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <span className={small}>Your products and prices are kept per store. SmartBite never contacts the store.</span>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            {keyOnly && <p id="setup-key-only" className="text-sm text-forest/80">Your profile file is open. It does not include your AI key, so add it here to start.</p>}
            <p className="text-xs text-forest/70">
              SmartBite writes ideas and recipes with your own AI key. It is stored only in this browser{choice.host ? ` and sent only to ${choice.host}` : ""}. No key? You can still try the demo.
            </p>
            <div>
              <span id="setup-provider-label" className={label}>AI provider</span>
              <div role="radiogroup" aria-labelledby="setup-provider-label" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {KEY_CHOICES.map((c) => (
                  <button key={c.id} role="radio" aria-checked={provider === c.id} onClick={() => pickProvider(c.id)}
                    className={`rounded-xl p-3 text-sm font-bold border transition-colors ${provider === c.id ? "bg-lime-soft border-forest text-forest" : "bg-cream/50 border-cream-dark text-forest/70 hover:border-forest"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              {provider === GEMINI.id && <span className={small}>{EXPERIMENTAL_LABEL} Model: {GEMINI.model}.</span>}
            </div>
            {provider === OTHER ? (
              <p id="setup-other" className="text-xs text-forest/80 bg-cream/50 border border-cream-dark rounded-xl p-3">
                OpenAI, OpenRouter or another OpenAI-compatible endpoint need a model name too, so they are set up in your{" "}
                <Link href="/profile#ai-provider" onClick={() => onClose(SETUP_DONE, { profile: true })} className="font-bold underline hover:text-lime-hover">Profile</Link>.
                What you saved in the steps before is kept. Not tested by SmartBite yet: results may vary.
              </p>
            ) : (
            <div>
              <label htmlFor="setup-key" className={label}>{choice.field}</label>
              <input id="setup-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={choice.placeholder} className={input} />
              <span className={small}>
                <a href={choice.getKey} target="_blank" rel="noopener noreferrer" className="font-bold underline hover:text-lime-hover">{choice.getKeyLabel}</a>.
              </span>
            </div>
            )}
            {error && <div role="status" className="bg-amber-100 text-amber-900 text-xs rounded-xl p-3">{error}</div>}
          </div>
        )}

        {step === 2 && (
          <p className="text-sm text-forest/80">
            Your profile is saved in this browser. Change anything later in your <Link href="/profile" onClick={() => onClose(SETUP_DONE, { profile: true })} className="font-bold underline hover:text-lime-hover">Profile</Link>,
            and save a profile file there to keep it or move it to another browser.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {step === 0 && <button onClick={saveShop} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">Next</button>}
          {step === 1 && provider !== OTHER && <button onClick={saveKey} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">Save key</button>}
          {step === 2 && <button onClick={() => onClose(SETUP_DONE)} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">Make Your Meal</button>}
          {step === 1 && !keyOnly && <button onClick={() => { setError(""); setStep(0); }} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2.5">Back</button>}
        </div>
      </div>
    </div>
  );
}
