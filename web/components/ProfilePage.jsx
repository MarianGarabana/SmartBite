"use client";
// Profile (was Settings until 2026-10-22): display name, every Kitchen Profile field
// (prompts/kitchen-profile.default.json), the AI provider with the user's own key, and where they shop (country,
// currency, region, products). All of it stays in this browser (lib/store.js). Same cards, inputs and buttons as the Make Your
// Meal form.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LANG_NAMES, setLang, t, tx, useLang, useT } from "../lib/i18n";
import { formatFixed } from "../lib/numbers";
import { DEFAULT_PROFILE, setField } from "../lib/profile";
import { ANTHROPIC, ANTHROPIC_MODELS, EXPERIMENTAL_LABEL, OPENAI_COMPATIBLE, OPENAI_PRESETS, endpointAllowed, presetAvailable, presetById }
  from "../lib/providers";
import { COUNTRIES, DEFAULT_COUNTRY, OTHER_COUNTRY, DEFAULT_CURRENCY, ESTIMATES, ESTIMATE_CURRENCY, hasEstimates, ESTIMATES_OFF, NATIONAL, REGIONS, clearApiKey, currencies, currencyFor, clearOpenAiKey, exportProducts, exportProfile, importProducts,
  onStoreChange, readApiKey, readCountry, readLlmSettings, readOpenAiKey, readProducts, readBudget, readCurrency, readName, readProfile, readRegion, resetProfile,
  writeApiKey, writeCountry, writeLlmSettings, writeOpenAiKey, writeBudget, writeCurrency, writeName, writeProfile, writeRegion } from "../lib/store";
import { PageShell, downloadJson, useToast } from "./Chrome";
import ProfileFileOpen from "./ProfileFileOpen";
import { countryOptions, countryText, currencyOptions } from "./SetupDialog";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2";
// Phone jump bar: [section id, icon, text]
const JUMP = [["kitchen-profile", "fa-kitchen-set", "Kitchen"], ["ai-provider", "fa-key", "AI key"],
  ["where-you-shop", "fa-wallet", "Prices"], ["profile-file", "fa-file-arrow-down", "File"]];
const input = "w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest";
// Text fields hold whole sentences: same look as the craving box of the Make Your Meal form
const textArea = "w-full bg-cream/50 border border-cream-dark rounded-2xl p-4 text-sm text-forest placeholder-forest/40 focus:outline-none focus:border-forest";
// Inputs on the dark provider card (same as the key input)
const darkLabel = "block text-xs font-bold uppercase tracking-wider text-cream/70 mb-2";
const darkInput = "w-full bg-forest-card border border-cream/10 rounded-xl px-4 py-2.5 text-xs text-cream font-mono placeholder-cream/40 focus:outline-none focus:border-lime";

function ListField({ field, onChange }) {
  const tr = useT();
  const [text, setText] = useState("");
  const items = Array.isArray(field.value) ? field.value : [];
  const add = () => {
    const val = text.trim();
    if (!val) return;
    onChange([...items, val]);
    setText("");
  };
  return (
    <div>
      <label htmlFor={`field-${field.id}`} className={label}>{tr(field.label)}</label>
      <div className="flex items-center gap-2 mb-3">
        <input type="text" id={`field-${field.id}`} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={field.help ? tr(field.help) : tr("Type one item and press Add")}
          className="flex-1 bg-cream/50 border border-cream-dark rounded-xl px-4 py-2.5 text-xs text-forest focus:outline-none focus:border-forest" />
        <button onClick={add} className="bg-forest text-cream font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-forest-light">{tr("Add")}</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((t, i) => (
          <span key={`${t}-${i}`} className="tag-item inline-flex items-center gap-1.5 bg-cream-dark text-forest text-xs px-3 py-1 rounded-full font-medium">
            {t}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={tr("Remove {item}", { item: t })} className="hover:text-red-600"><i className="fa-solid fa-xmark text-[10px]"></i></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function Field({ field, onChange }) {
  useLang();
  if (field.type === "list") return <ListField field={field} onChange={onChange} />;
  if (field.type === "text") {
    return (
      <div>
        <label htmlFor={`field-${field.id}`} className={label}>{t(field.label)}</label>
        {/* Tall enough for its text (about 60 characters a line); browsers with field-sizing grow it as you type */}
        <textarea id={`field-${field.id}`} rows={Math.min(8, Math.max(2, Math.ceil(String(field.value ?? "").length / 60)))}
          value={field.value ?? ""} onChange={(e) => onChange(e.target.value)}
          placeholder={t("Empty: this line is left out")} className={`${textArea} [field-sizing:content] min-h-[4.5rem]`}></textarea>
        {field.help && <span className="block text-[11px] text-forest/70 mt-1">{t(field.help)}</span>}
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={`field-${field.id}`} className={label}>{t(field.label)}{field.unit ? ` (${field.unit})` : ""}</label>
      <input id={`field-${field.id}`} type={field.type === "number" ? "number" : "text"} value={field.value ?? ""}
        onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
        className={input} />
      {field.help && <span className="block text-[11px] text-forest/70 mt-1">{t(field.help)}</span>}
    </div>
  );
}

export default function ProfilePage({ demoMeals }) {
  const lang = useLang();
  const router = useRouter();
  const toastState = useToast();
  const { showToast } = toastState;
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  // Provider settings (no keys) and one key per provider; the field shows the key of the chosen provider
  const [llm, setLlm] = useState(null);
  const [keys, setKeys] = useState({ [ANTHROPIC]: "", [OPENAI_COMPATIBLE]: "" });
  const [savedKeys, setSavedKeys] = useState({ [ANTHROPIC]: "", [OPENAI_COMPATIBLE]: "" });
  const [showKey, setShowKey] = useState(false);
  const [hostname, setHostname] = useState("");
  // Country (estimated prices, pack sizes) and region for estimated prices: saved as soon as they change
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [region, setRegion] = useState(NATIONAL);
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  // Country and currency names come from the browser's Intl data, which can differ from the server's (e.g. "Falkland
  // Islands"): the full lists are filled in after the first render, so the server and the first paint match
  const [countryList, setCountryList] = useState([]);
  const [currencyList, setCurrencyList] = useState([]);
  const [name, setName] = useState(""); // the field
  const [readyName, setReadyName] = useState(""); // the saved name, for the heading
  const [budget, setBudget] = useState(""); // budget per meal, the Make Your Meal starting value
  // Everything on this page from storage: on the first render, and again after a profile file is opened
  const load = () => {
    setCountry(readCountry());
    setRegion(readRegion());
    setCurrency(readCurrency());
    setCountryList(COUNTRIES);
    setCurrencyList(currencies());
    setName(readName());
    setReadyName(readName());
    setBudget(formatFixed(readBudget(), 2, { country: readCountry() })); // "5,50" in Spain (lib/numbers.js)
    setProfile(readProfile());
    setLlm(readLlmSettings());
    const k = { [ANTHROPIC]: readApiKey(), [OPENAI_COMPATIBLE]: readOpenAiKey() };
    setSavedKeys(k);
    setKeys(k);
  };
  useEffect(() => {
    load();
    setHostname(window.location.hostname);
    // A link to one field (My Day's "Set your daily targets", UX review 2026-11-21): bring it to the middle of the
    // screen, clear of the sticky header and jump bar, and put the cursor in it
    const field = /^#field-[\w-]+$/.test(window.location.hash) && document.querySelector(window.location.hash);
    if (field) setTimeout(() => { field.scrollIntoView({ block: "center" }); field.focus({ preventScroll: true }); }, 100);
  }, []);

  // A new country brings its currency (when SmartBite knows it); the user can pick another after
  const pickCountry = (id) => {
    setCountry(id);
    setRegion(readRegion(id));
    const own = currencyFor(id);
    if (own) {
      setCurrency(own);
      writeCurrency(own);
    }
    showToast(writeCountry(id) ? t("Country saved in this browser.") : t("Not saved: this browser blocks storage."));
  };
  const pickCurrency = (code) => {
    setCurrency(code);
    showToast(writeCurrency(code) ? t("Currency saved in this browser.") : t("Not saved: this browser blocks storage."));
  };
  const saveBudget = () => {
    const b = Number(String(budget).trim().replace(",", "."));
    if (!(b > 0 && b <= 1000)) return showToast(t("Budget per meal: a number above 0."));
    if (b === readBudget()) return;
    showToast(writeBudget(b) ? t("Budget saved in this browser.") : t("Not saved: this browser blocks storage."));
  };
  const saveName = () => {
    if (name.trim() === readName()) return;
    if (!writeName(name)) return showToast(t("Not saved: this browser blocks storage."));
    setReadyName(readName());
    showToast(name.trim() ? t("Name saved in this browser.") : t("Name removed."));
  };
  const pickRegion = (id) => {
    setRegion(id);
    showToast(!writeRegion(id) ? t("Not saved: this browser blocks storage.")
      : id === ESTIMATES_OFF ? t("Estimated prices off.") : t("Estimated prices saved in this browser."));
  };
  const regions = REGIONS[country] || [];
  const countryLabel = countryText(COUNTRIES.find((c) => c.id === country), lang) || country;
  // "the United Kingdom" in English; Spanish names need no article here
  const theCountry = `${lang === "en" && ["GB", "US"].includes(country) ? "the " : ""}${countryLabel}`;
  const regionName = regions.find((r) => r.id === region)?.label;

  // Products: counted on every storage change
  const [products, setProducts] = useState({});
  useEffect(() => {
    const read = () => setProducts(readProducts());
    read();
    return onStoreChange(read);
  }, []);
  const total = Object.keys(products).length;
  const saveFile = downloadJson;
  const download = () => saveFile(exportProducts(), "smartbite-products");

  // Profile file: save one, or open one in place of this browser's profile (ProfileFileOpen: confirm and backup)
  const [withKey, setWithKey] = useState(false);
  const saveProfileFile = () => {
    saveFile(exportProfile({ withKeys: withKey }), "smartbite-profile");
    showToast(withKey ? t("Profile file saved, with your key. Keep it private.") : t("Profile file saved."));
  };
  const profileOpened = (_summary, ok, backup) => {
    load();
    showToast(!ok ? t("Not saved: this browser blocks storage.")
      : backup ? t("Profile opened. Your previous one was downloaded as a backup.") : t("Profile opened."));
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1_000_000) return showToast(t("This file is too big for a products file."));
    const out = importProducts(await file.text());
    showToast(!out.ok ? t(out.error)
      : out.skipped ? (out.added === 1 ? t("Added {n} product, {skipped} skipped.", { n: out.added, skipped: out.skipped }) : t("Added {n} products, {skipped} skipped.", { n: out.added, skipped: out.skipped }))
        : out.added === 1 ? t("Added {n} product.", { n: out.added }) : t("Added {n} products.", { n: out.added }));
  };

  const saveProfile = () => showToast(writeProfile(profile) ? t("Profile saved in this browser.") : t("Not saved: this browser blocks storage."));
  const reset = () => {
    resetProfile();
    setProfile(DEFAULT_PROFILE);
    showToast(t("Profile back to the defaults."));
  };

  const provider = llm?.provider || ANTHROPIC;
  const preset = presetById(llm?.openai.preset);
  const key = keys[provider];
  const savedKey = savedKeys[provider];
  const setOpenAi = (patch) => setLlm((l) => ({ ...l, openai: { ...l.openai, ...patch } }));
  const pickPreset = (id) => {
    const p = presetById(id);
    setOpenAi({ preset: p.id, baseUrl: p.baseUrl, model: p.model });
  };
  const saveProvider = () => {
    const k = key.trim();
    if (provider === ANTHROPIC) {
      if (!k) return showToast(t("Paste your key first."));
      if (!k.startsWith("sk-ant-")) return showToast(t("That does not look like an Anthropic key (it starts with sk-ant-)."));
    } else {
      if (!presetAvailable(preset, hostname)) return showToast(t("Ollama is not reachable from this site. Pick another endpoint."));
      if (!/^https?:\/\/\S+$/i.test(llm.openai.baseUrl.trim())) return showToast(t("Add the base URL first (it starts with https://)."));
      if (!endpointAllowed(llm.openai.baseUrl, hostname)) {
        return showToast(t("This site can only reach the listed endpoints and your own computer. For others, run SmartBite on your computer."));
      }
      if (!llm.openai.model.trim()) return showToast(t("Add the model name first."));
      if (preset.keyNeeded && !k) return showToast(t("Paste your key first."));
    }
    const settings = { ...llm, openai: { ...llm.openai, baseUrl: llm.openai.baseUrl.trim(), model: llm.openai.model.trim() } };
    const keyOk = provider === ANTHROPIC ? writeApiKey(k) : k ? writeOpenAiKey(k) : (clearOpenAiKey(), true);
    if (!writeLlmSettings(settings) || !keyOk) return showToast(t("Not saved: this browser blocks storage."));
    setLlm(settings);
    setSavedKeys({ ...savedKeys, [provider]: k });
    showToast(t("Provider and key saved in this browser."));
  };
  const removeKey = () => {
    if (provider === ANTHROPIC) clearApiKey();
    else clearOpenAiKey();
    setSavedKeys({ ...savedKeys, [provider]: "" });
    setKeys({ ...keys, [provider]: "" });
    showToast(t("Key removed from this browser."));
  };
  const keyHost = provider === ANTHROPIC ? "api.anthropic.com" : (() => {
    try { return new URL(llm.openai.baseUrl).host; } catch { return t("the endpoint you set"); }
  })();

  return (
    <PageShell active="profile" demoMeals={demoMeals} router={router} toastState={toastState}>
      <section id="profile-page" className="tab-page space-y-8 max-w-[1360px] mx-auto px-8">
        <div>
          <span className="font-script text-3xl text-forest font-bold">{t("Your Kitchen")}</span>
          <h1 className="font-serif text-4xl font-bold text-forest">{readyName ? t("{name}'s profile", { name: readyName }) : t("Your profile")}</h1>
        </div>
        {/* Phones only (decided 2026-11-20, option 3B): a jump bar that stays under the header, and the right column
            (name, AI key, prices, profile file) first, so the key is on the first screen. Hidden from 640 px. */}
        <nav aria-label={t("On this page")} className="sm:hidden sticky top-[81px] z-30 -mx-8 px-4 py-2 bg-cream/95 backdrop-blur-md border-b border-forest/10 grid grid-cols-4 gap-1">
          {JUMP.map(([id, icon, text]) => (
            <a key={id} href={`#${id}`} className="py-2 rounded-xl text-[11px] font-bold text-forest bg-white border border-cream-dark flex flex-col items-center gap-1">
              <i className={`fa-solid ${icon} text-xs`} aria-hidden="true"></i>{t(text)}
            </a>
          ))}
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Kitchen Profile */}
          <div id="kitchen-profile" className="max-sm:scroll-mt-40 lg:col-span-7 bg-white rounded-3xl p-8 sm:p-10 shadow-soft border border-cream-dark space-y-8">
            <div>
              <span className="font-script text-2xl text-forest font-bold">{t("How you cook")}</span>
              <h2 className="font-serif text-3xl font-bold text-forest">{t("Kitchen Profile")}</h2>
              <p className="text-xs text-forest/70 mt-2">{t("Every line here goes into the prompt for your ideas and recipes; the targets also fill in the Make Your Meal form. Empty a line to leave it out. The daily targets are for My Day only and are not sent to the AI.")}</p>
            </div>
            {profile.sections.map((s) => (
              <div key={s.id} className="space-y-6 pt-2 border-t border-cream-dark first:border-t-0 first:pt-0">
                <h3 className="text-xs font-bold uppercase tracking-widest text-forest/70">{t(s.label)}</h3>
                <div className={`grid grid-cols-1 gap-6${s.fields.every((f) => f.type === "number") ? " sm:grid-cols-2" : ""}`}>
                  {s.fields.map((f) => (
                    <Field key={f.id} field={f} onChange={(value) => setProfile((p) => setField(p, f.id, value))} />
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button onClick={saveProfile} className="flex-1 bg-lime hover:bg-lime-hover text-forest font-bold py-3 rounded-2xl text-sm transition-all shadow-glow">
                {t("Save profile")}
              </button>
              <button onClick={reset} className="flex-1 bg-cream-card hover:bg-cream-dark text-forest font-bold py-3 rounded-2xl text-sm transition-colors border border-cream-dark">
                {t("Reset to defaults")}
              </button>
            </div>
          </div>

          {/* About you, API key, where you shop */}
          <div className="lg:col-span-5 space-y-6 max-sm:order-first">
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-4">
              <div>
                <span className="font-script text-2xl text-forest font-bold">{t("On this page")}</span>
                <h2 className="font-serif font-bold text-xl text-forest">{t("Your name")}</h2>
              </div>
              <div>
                <label htmlFor="profile-name" className={label}>{t("Display name")}</label>
                <input id="profile-name" value={name} maxLength={40} placeholder={t("Optional")} onChange={(e) => setName(e.target.value)}
                  onBlur={saveName} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} className={input} />
                <span className="block text-[11px] text-forest/70 mt-1">{t("Shown on this page only. It stays in this browser.")}</span>
              </div>
            </div>
            <div id="ai-provider" className="scroll-mt-24 max-sm:scroll-mt-40 bg-forest text-cream rounded-3xl p-6 sm:p-8 shadow-card space-y-5">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-key text-lime text-lg"></i>
                <h2 className="font-serif font-bold text-xl text-white">{t("Your AI provider and key")}</h2>
              </div>
              <p className="text-xs text-cream/80 leading-relaxed">
                {t("SmartBite uses your own key to write ideas and recipes. The key is stored only in this browser. It never leaves the browser except to {host}, when you make a meal. Usage is billed to your account with that provider.", { host: keyHost })}
              </p>
              <div>
                <label htmlFor="llm-provider" className={darkLabel}>{t("Provider")}</label>
                <select id="llm-provider" value={provider} disabled={!llm}
                  onChange={(e) => { setLlm((l) => ({ ...l, provider: e.target.value })); setShowKey(false); }} className={darkInput}>
                  <option value={ANTHROPIC}>Anthropic (Claude)</option>
                  <option value={OPENAI_COMPATIBLE}>{t("OpenAI-compatible (experimental)")}</option>
                </select>
              </div>
              {llm && provider === ANTHROPIC && (
                <div>
                  <label htmlFor="llm-model" className={darkLabel}>{t("Model")}</label>
                  <select id="llm-model" value={llm.anthropicModel} onChange={(e) => setLlm((l) => ({ ...l, anthropicModel: e.target.value }))} className={darkInput}>
                    {ANTHROPIC_MODELS.map((m) => <option key={m.id} value={m.id}>{t(m.label)}</option>)}
                  </select>
                </div>
              )}
              {llm && provider === OPENAI_COMPATIBLE && (
                <div className="space-y-5">
                  <span id="llm-experimental" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-forest bg-lime px-2 py-0.5 rounded-full">
                    <i className="fa-solid fa-flask text-[9px]"></i>{t(EXPERIMENTAL_LABEL)}
                  </span>
                  <div>
                    <label htmlFor="llm-preset" className={darkLabel}>{t("Endpoint")}</label>
                    <select id="llm-preset" value={preset.id} onChange={(e) => pickPreset(e.target.value)} className={darkInput}>
                      {OPENAI_PRESETS.map((p) => (
                        <option key={p.id} value={p.id} disabled={!presetAvailable(p, hostname)}>
                          {t(p.label)}{presetAvailable(p, hostname) ? "" : t(" (not reachable from this site)")}
                        </option>
                      ))}
                    </select>
                    <span id="llm-cors-note" className="block text-[11px] text-cream/60 mt-2">
                      {presetAvailable(preset, hostname) ? t(preset.cors)
                        : t("Not offered here: Ollama blocks browser calls from other sites by default. Run SmartBite on your own computer, or start Ollama with OLLAMA_ORIGINS set to this site's address and use Other OpenAI-compatible endpoint.")}
                    </span>
                  </div>
                  <div>
                    <label htmlFor="llm-base-url" className={darkLabel}>{t("Base URL")}</label>
                    <input id="llm-base-url" type="url" value={llm.openai.baseUrl} onChange={(e) => setOpenAi({ baseUrl: e.target.value })}
                      autoComplete="off" spellCheck={false} placeholder="https://.../v1" className={darkInput} />
                  </div>
                  <div>
                    <label htmlFor="llm-openai-model" className={darkLabel}>{t("Model")}</label>
                    <input id="llm-openai-model" type="text" value={llm.openai.model} onChange={(e) => setOpenAi({ model: e.target.value })}
                      autoComplete="off" spellCheck={false} placeholder={t("Model name from your provider")} className={darkInput} />
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="api-key" className={darkLabel}>{t("API key")}{provider === OPENAI_COMPATIBLE && !preset.keyNeeded ? t(" (if the endpoint needs one)") : ""}</label>
                <div className="flex items-center gap-2">
                  <input id="api-key" type={showKey ? "text" : "password"} value={key} onChange={(e) => setKeys({ ...keys, [provider]: e.target.value })}
                    autoComplete="off" spellCheck={false} placeholder={provider === ANTHROPIC ? "sk-ant-..." : t("Your key for this endpoint")}
                    className="flex-1 bg-forest-card border border-cream/10 rounded-xl px-4 py-2.5 text-xs text-cream font-mono placeholder-cream/40 focus:outline-none focus:border-lime" />
                  <button onClick={() => setShowKey(!showKey)} aria-label={showKey ? t("Hide key") : t("Show key")}
                    className="w-10 h-10 rounded-xl bg-forest-card border border-cream/10 text-cream/70 hover:text-lime">
                    <i className={`fa-regular ${showKey ? "fa-eye-slash" : "fa-eye"} text-xs`}></i>
                  </button>
                </div>
                <span id="api-key-status" className="block text-[11px] text-cream/60 mt-2">
                  {savedKey ? t("Saved in this browser (ends in {end}).", { end: savedKey.slice(-4) }) : provider === ANTHROPIC ? t("No key saved: Make Your Meal needs one. The demo works without a key.") : t("No key saved for this endpoint.")}
                </span>
              </div>
              <div className="flex gap-3">
                <button onClick={saveProvider} disabled={!llm} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">{t("Save provider and key")}</button>
                {savedKey && (
                  <button onClick={removeKey} className="text-xs font-bold text-cream/70 hover:text-lime px-3 py-2.5">{t("Remove key")}</button>
                )}
              </div>
            </div>
            <div id="where-you-shop" className="max-sm:scroll-mt-40 bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-4">
              <div>
                <span className="font-script text-2xl text-forest font-bold">{t("Where you shop")}</span>
                <h2 className="font-serif font-bold text-xl text-forest">{t("Country and prices")}</h2>
              </div>
              <div>
                <label htmlFor="price-country" className={label}>{t("Country")}</label>
                <select id="price-country" value={country} onChange={(e) => pickCountry(e.target.value)} className={input}>
                  {countryOptions(countryList.length ? countryList : COUNTRIES.filter((c) => c.id === country), lang).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                {!hasEstimates(country) && (
                  <span className="block text-[11px] text-forest/70 mt-1">
                    {country === OTHER_COUNTRY ? t("No estimated prices outside the listed countries: only the prices you type count. The budget check waits for a price on every item.")
                      : t("No estimated prices for {country} yet: only the prices you type count. The budget check waits for a price on every item.", { country: theCountry })}
                  </span>
                )}
              </div>
              <div>
                <label htmlFor="currency" className={label}>{t("Currency")}</label>
                <select id="currency" value={currency} onChange={(e) => pickCurrency(e.target.value)} className={input}>
                  {(currencyList.length ? currencyOptions(currencyList, lang) : [{ id: currency, label: currency }]).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <span className="block text-[11px] text-forest/70 mt-1">
                  {t("Shown next to every price. Nothing is converted: type prices in this currency.")}
                  {hasEstimates(country) && ESTIMATE_CURRENCY[country] !== currency ? t(" Estimated prices for {country} are in {estimate}, so they are off while your currency is {currency}.", { country: countryLabel, estimate: ESTIMATE_CURRENCY[country], currency }) : ""}
                </span>
              </div>
              {/* Language (Marian 2026-11-21): a site setting next to country and currency, besides the footer switch */}
              <div>
                <label htmlFor="profile-lang" className={label}>{t("Language")}</label>
                <select id="profile-lang" value={lang} onChange={(e) => setLang(e.target.value, { save: true })} className={input}>
                  {["es", "en"].map((l) => <option key={l} value={l} lang={l}>{LANG_NAMES[l]}</option>)}
                </select>
                <span className="block text-[11px] text-forest/70 mt-1">{t("Saved in this browser. The link at the bottom of every page switches it too.")}</span>
              </div>
              <div>
                <label htmlFor="profile-budget" className={label}>{t("Budget per meal")}</label>
                <input id="profile-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} onBlur={saveBudget}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} className={input} />
                <span className="block text-[11px] text-forest/70 mt-1">{t("For one serving. Make Your Meal starts from this; it is not sent to the AI.")}</span>
              </div>
              {hasEstimates(country) && ESTIMATE_CURRENCY[country] === currency && (
                <div>
                  <label htmlFor="price-region" className={label}>{t("Estimated prices")}</label>
                  <select id="price-region" value={region} onChange={(e) => pickRegion(e.target.value)} className={input}>
                    <option value={NATIONAL}>{t("{country} average", { country: countryLabel })}</option>
                    {regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    <option value={ESTIMATES_OFF}>{t("Off: only my prices")}</option>
                  </select>
                  <span className="block text-[11px] text-forest/70 mt-1">
                    {region === ESTIMATES_OFF
                      ? t("Only the prices you type count. The budget check waits for a price on every item.")
                      : regionName
                        ? t("Items you have not priced get {phrase} in {region} (the {country} average where the region has too little data) over the latest 12 months published ({source}; {foods} foods have one). They show as est. on the recipe page; a price you type always wins.",
                          { phrase: t(ESTIMATES[country].phrase), region: regionName, country: countryLabel, source: t(ESTIMATES[country].sourceLong), foods: ESTIMATES[country].foods })
                        : t("Items you have not priced get {phrase} in {country} over the latest 12 months published ({source}; {foods} foods have one). They show as est. on the recipe page; a price you type always wins.",
                          { phrase: t(ESTIMATES[country].phrase), country: theCountry, source: t(ESTIMATES[country].sourceLong), foods: ESTIMATES[country].foods })}
                  </span>
                </div>
              )}
              <div className="space-y-2">
                <span className={label}>{t("Your products")}</span>
                <p className="text-xs text-forest/80">
                  {total === 0 ? t("None yet. Use Edit product on a shopping line, or type a price there.")
                    : t("{n} saved in this browser. They count wherever you shop.", { n: total })}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={download} disabled={!total} className="bg-forest text-cream hover:bg-forest/90 disabled:opacity-40 font-bold text-xs px-4 py-2 rounded-xl transition-colors">{t("Export products")}</button>
                  <label className="bg-cream-dark text-forest hover:bg-cream-dark/70 font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer">
                    {t("Import products")}
                    <input type="file" accept="application/json,.json" onChange={upload} className="sr-only" />
                  </label>
                </div>
                <span className="block text-[11px] text-forest/70">{t("A file to keep your products, or move them to another browser.")}</span>
              </div>
            </div>
            <div id="profile-file" className="max-sm:scroll-mt-40 bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-4">
              <div>
                <span className="font-script text-2xl text-forest font-bold">{t("Keep it or move it")}</span>
                <h2 className="font-serif font-bold text-xl text-forest">{t("Profile file")}</h2>
              </div>
              <p className="text-xs text-forest/80 leading-relaxed">
                {t("One file with your Kitchen Profile, where you shop, your products, saved meals, cart and My Day. Open it in another browser to pick up where you left off. Photos are not included.")}
              </p>
              <label className="flex items-start gap-2 text-xs font-bold text-forest">
                <input id="profile-file-key" type="checkbox" checked={withKey} onChange={(e) => setWithKey(e.target.checked)} className="accent-lime w-4 h-4 mt-0.5" />
                <span>{t("Include my API key")}</span>
              </label>
              {withKey && (
                <div role="status" className="bg-amber-100 text-amber-900 text-xs rounded-xl p-3">
                  {t("Anyone who has this file can use your key and spend on your account. Keep the file private.")}
                </div>
              )}
              <button onClick={saveProfileFile} className="bg-forest text-cream hover:bg-forest/90 font-bold text-xs px-4 py-2 rounded-xl transition-colors">{t("Save profile file")}</button>
              <ProfileFileOpen id="profile-file" onOpened={profileOpened} showToast={showToast} />
            </div>
            <div className="bg-cream-card rounded-3xl p-6 border border-cream-dark flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-lime text-forest flex items-center justify-center shrink-0 font-bold text-lg">
                <i className="fa-solid fa-lock"></i>
              </div>
              <div className="space-y-1">
                <h4 className="font-serif font-bold text-lg text-forest">{t("No accounts")}</h4>
                <p className="text-xs text-forest/80 leading-relaxed">
                  {tx("Your profile, cart, saved meals and photos stay in this browser. {link}.", {
                    link: <Link href="/privacy" className="font-bold underline hover:text-lime-hover">{t("Read the privacy note")}</Link> })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
