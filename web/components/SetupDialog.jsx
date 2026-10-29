"use client";
// Create profile (decided 2026-10-22): a short first-run setup, saved in this browser like the Profile page. Three
// steps, each with Skip: where you shop, your targets, your AI key; then "You're set". Everything else keeps its
// default and is edited in the Profile. Opened from the profile menu, or once on the first "Show me 4 ideas"
// (openSetup). Styles from the Edit product dialog (design freeze).
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_PROFILE, fieldValue, setField } from "../lib/profile";
import { ANTHROPIC } from "../lib/providers";
import { COUNTRIES, DEFAULT_COUNTRY, ESTIMATE_CURRENCY, NATIONAL, NO_STORE, REGIONS, SETUP_DONE, SETUP_SKIPPED, STORES,
  currencyFor, currencySymbol, markSetup, readApiKey, readBudget, readCountry, readCurrency, readLlmSettings, readProfile,
  readRegion, readStore, writeApiKey, writeBudget, writeCountry, writeCurrency, writeLlmSettings, writeProfile, writeRegion,
  writeStore } from "../lib/store";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2";
const input = "w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest";
const small = "block text-[11px] text-forest/70 mt-1";
const STEPS = ["Where you shop", "Your targets", "Your AI key"];
const SETUP_EVENT = "smartbite-setup";
export const SETUP_DONE_EVENT = "smartbite-setup-done"; // after the setup is finished: forms re-read their defaults

// Opens the setup on any page with a header; onClose(state, { profile }) gets "done" or "skipped" when it closes,
// and profile true when the user left through the link to the Profile
export function openSetup(onClose) {
  window.dispatchEvent(new CustomEvent(SETUP_EVENT, { detail: { onClose } }));
}

// Mounted once in the header: listens for openSetup and shows the dialog. The dialog goes to document.body: the
// header's backdrop blur makes it the box that fixed children are placed in, which cut the dialog to 80 px.
export function SetupHost() {
  const [open, setOpen] = useState(null); // { onClose } while the dialog shows
  useEffect(() => {
    const show = (e) => setOpen({ onClose: e.detail?.onClose });
    window.addEventListener(SETUP_EVENT, show);
    return () => window.removeEventListener(SETUP_EVENT, show);
  }, []);
  if (!open) return null;
  const close = (state, opts = {}) => {
    markSetup(state);
    setOpen(null);
    if (state === SETUP_DONE) window.dispatchEvent(new Event(SETUP_DONE_EVENT));
    open.onClose?.(state, opts);
  };
  return createPortal(<SetupDialog onClose={close} />, document.body);
}

const num = (text) => {
  const t = String(text ?? "").trim().replace(",", ".");
  return /^\d+(\.\d*)?$/.test(t) ? Number(t) : NaN;
};

function SetupDialog({ onClose }) {
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [region, setRegion] = useState(NATIONAL);
  const [store, setStore] = useState(NO_STORE);
  const [countryList, setCountryList] = useState([]);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [budget, setBudget] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const p = readProfile();
    setCountry(readCountry());
    setRegion(readRegion());
    setStore(readStore().startsWith("other:") ? NO_STORE : readStore());
    setCountryList(COUNTRIES);
    setProfile(p);
    setKcal(String(fieldValue(p, "kcal_target") ?? ""));
    setProtein(String(fieldValue(p, "protein_g_target") ?? ""));
    setBudget(readBudget().toFixed(2));
    setKey(readApiKey());
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

  // Each step saves what it shows, then moves on; Skip moves on without saving
  const saveShop = () => {
    writeCountry(country);
    if (currencyFor(country)) writeCurrency(currencyFor(country));
    if (regions.length) writeRegion(region);
    writeStore(store);
    next();
  };
  const saveTargets = () => {
    const [k, p, b] = [num(kcal), num(protein), num(budget)];
    if (!(k >= 100 && k <= 3000)) return setError("Calories per meal: a number from 100 to 3000.");
    if (!(p >= 0 && p <= 300)) return setError("Protein per meal: a number from 0 to 300.");
    if (!(b > 0 && b <= 1000)) return setError("Budget per meal: a number above 0.");
    writeProfile(setField(setField(profile, "kcal_target", k), "protein_g_target", p));
    writeBudget(b);
    next();
  };
  const saveKey = () => {
    if (key.trim()) {
      writeLlmSettings({ ...readLlmSettings(), provider: ANTHROPIC });
      writeApiKey(key);
    }
    next();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-forest/40 flex items-center justify-center p-4" onClick={() => onClose(SETUP_SKIPPED)}>
      <div role="dialog" aria-modal="true" aria-labelledby="setup-title" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-8 shadow-card border border-cream-dark max-w-lg w-full space-y-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="font-script text-2xl text-forest font-bold">{step < STEPS.length ? `Step ${step + 1} of ${STEPS.length}` : "All done"}</span>
            <h2 id="setup-title" className="font-serif text-3xl font-bold text-forest leading-snug">{step < STEPS.length ? STEPS[step] : "You're set"}</h2>
          </div>
          {step < STEPS.length && (
            <button onClick={() => onClose(SETUP_SKIPPED)} className="text-xs font-bold text-forest/70 hover:text-forest whitespace-nowrap pt-2">Skip setup</button>
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
            <p className="text-xs text-forest/70">These fill in the Make Your Meal form. Fridge, freezer, gear and cooking style keep their defaults; change them in your Profile.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="setup-kcal" className={label}>Calories per meal</label>
                <input id="setup-kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} className={input} />
              </div>
              <div>
                <label htmlFor="setup-protein" className={label}>Protein per meal (g)</label>
                <input id="setup-protein" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} className={input} />
              </div>
              <div>
                <label htmlFor="setup-budget" className={label}>Budget per meal ({currencySymbol(readCurrency()) || readCurrency()})</label>
                <input id="setup-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} className={input} />
              </div>
            </div>
            {error && <div role="status" className="bg-amber-100 text-amber-900 text-xs rounded-xl p-3">{error}</div>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-forest/70">
              SmartBite writes ideas and recipes with your own Anthropic key. It is stored only in this browser and sent only to api.anthropic.com. No key? You can still try the demo ideas.
            </p>
            <div>
              <label htmlFor="setup-key" className={label}>Anthropic API key</label>
              <input id="setup-key" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-..." className={input} />
              <span className={small}>Another provider (OpenAI-compatible, experimental)? Set it up in your Profile.</span>
            </div>
          </div>
        )}

        {step === 3 && (
          <p className="text-sm text-forest/80">
            Your profile is saved in this browser. Change anything later in your <Link href="/profile" onClick={() => onClose(SETUP_DONE, { profile: true })} className="font-bold underline hover:text-lime-hover">Profile</Link>,
            and save a profile file there to keep it or move it to another browser.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {step === 0 && <button onClick={saveShop} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">Next</button>}
          {step === 1 && <button onClick={saveTargets} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">Next</button>}
          {step === 2 && <button onClick={saveKey} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">{key.trim() ? "Save key" : "Next"}</button>}
          {step === 3 && <button onClick={() => onClose(SETUP_DONE)} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">Make Your Meal</button>}
          {step > 0 && step < 3 && <button onClick={() => { setError(""); setStep((s) => s - 1); }} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2.5">Back</button>}
          {step < 3 && <button onClick={next} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2.5 ml-auto">Skip this step</button>}
        </div>
      </div>
    </div>
  );
}
