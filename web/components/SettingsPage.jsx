"use client";
// Profile and settings: every Kitchen Profile field (prompts/kitchen-profile.default.json) and the AI provider with
// the user's own key. Both stay in this browser (lib/store.js). Same cards, inputs and buttons as the Make Your
// Meal form.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEFAULT_PROFILE, setField } from "../lib/profile";
import { ANTHROPIC, ANTHROPIC_MODELS, EXPERIMENTAL_LABEL, OPENAI_COMPATIBLE, OPENAI_PRESETS, presetAvailable, presetById } from "../lib/providers";
import { COUNTRIES, DEFAULT_COUNTRY, NO_STORE, STORES, clearApiKey, clearOpenAiKey, exportProducts, importProducts, okStore,
  onStoreChange, readApiKey, readCountry, readLlmSettings, readOpenAiKey, readProducts, readProfile, readStore, resetProfile,
  storeLabel, writeApiKey, writeCountry, writeLlmSettings, writeOpenAiKey, writeProfile, writeStore } from "../lib/store";
import { PageShell, useToast } from "./Chrome";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2";
const input = "w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest";
// Text fields hold whole sentences: same look as the craving box of the Make Your Meal form
const textArea = "w-full bg-cream/50 border border-cream-dark rounded-2xl p-4 text-sm text-forest placeholder-forest/40 focus:outline-none focus:border-forest";
// Inputs on the dark provider card (same as the key input)
const darkLabel = "block text-xs font-bold uppercase tracking-wider text-cream/70 mb-2";
const darkInput = "w-full bg-forest-card border border-cream/10 rounded-xl px-4 py-2.5 text-xs text-cream font-mono placeholder-cream/40 focus:outline-none focus:border-lime";

function ListField({ field, onChange }) {
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
      <label htmlFor={`field-${field.id}`} className={label}>{field.label}</label>
      <div className="flex items-center gap-2 mb-3">
        <input type="text" id={`field-${field.id}`} value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={field.help || "Type one item and press Add"}
          className="flex-1 bg-cream/50 border border-cream-dark rounded-xl px-4 py-2.5 text-xs text-forest focus:outline-none focus:border-forest" />
        <button onClick={add} className="bg-forest text-cream font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-forest-light">Add</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((t, i) => (
          <span key={`${t}-${i}`} className="tag-item inline-flex items-center gap-1.5 bg-cream-dark text-forest text-xs px-3 py-1 rounded-full font-medium">
            {t}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${t}`} className="hover:text-red-600"><i className="fa-solid fa-xmark text-[10px]"></i></button>
          </span>
        ))}
      </div>
    </div>
  );
}

function Field({ field, onChange }) {
  if (field.type === "list") return <ListField field={field} onChange={onChange} />;
  if (field.type === "text") {
    return (
      <div>
        <label htmlFor={`field-${field.id}`} className={label}>{field.label}</label>
        <textarea id={`field-${field.id}`} rows={2} value={field.value ?? ""} onChange={(e) => onChange(e.target.value)}
          placeholder="Empty: this line is left out" className={textArea}></textarea>
        {field.help && <span className="block text-[11px] text-forest/60 mt-1">{field.help}</span>}
      </div>
    );
  }
  return (
    <div>
      <label htmlFor={`field-${field.id}`} className={label}>{field.label}{field.unit ? ` (${field.unit})` : ""}</label>
      <input id={`field-${field.id}`} type={field.type === "number" ? "number" : "text"} value={field.value ?? ""}
        onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
        className={input} />
      {field.help && <span className="block text-[11px] text-forest/60 mt-1">{field.help}</span>}
    </div>
  );
}

export default function SettingsPage({ demoMeals }) {
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
  // Country for estimated prices: saved as soon as it changes
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  useEffect(() => {
    setCountry(readCountry());
    setProfile(readProfile());
    setLlm(readLlmSettings());
    const k = { [ANTHROPIC]: readApiKey(), [OPENAI_COMPATIBLE]: readOpenAiKey() };
    setSavedKeys(k);
    setKeys(k);
    setHostname(window.location.hostname);
  }, []);

  const pickCountry = (id) => {
    setCountry(id);
    showToast(writeCountry(id) ? (id === "none" ? "Estimated prices off." : "Country saved in this browser.") : "Not saved: this browser blocks storage.");
  };

  // Supermarket: saved as soon as it changes ("Other" waits for a name). Products: counted on every storage change.
  const [store, setStore] = useState(NO_STORE);
  const [otherName, setOtherName] = useState("");
  const [products, setProducts] = useState({});
  useEffect(() => {
    const s = readStore();
    setStore(s.startsWith("other:") ? "other" : s);
    setOtherName(s.startsWith("other:") ? s.slice(6) : "");
    const read = () => setProducts(readProducts());
    read();
    return onStoreChange(read);
  }, []);
  const saveStore = (id) => showToast(writeStore(id)
    ? (id === NO_STORE ? "No store: your products for any store are used." : `Shopping at ${storeLabel(okStore(id))}.`)
    : "Not saved: this browser blocks storage.");
  const pickStore = (id) => {
    setStore(id);
    if (id !== "other") saveStore(id);
    else if (otherName.trim()) saveStore(`other:${otherName}`);
  };
  const storeId = store === "other" ? okStore(`other:${otherName}`) : store;
  const counts = Object.keys(products).reduce((c, k) => {
    const s = k.slice(0, k.lastIndexOf("|"));
    return { ...c, [s]: (c[s] || 0) + 1 };
  }, {});
  const total = Object.keys(products).length;
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportProducts()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `smartbite-products-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const upload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 1_000_000) return showToast("This file is too big for a products file.");
    const out = importProducts(await file.text());
    showToast(out.ok ? `Added ${out.added} product${out.added === 1 ? "" : "s"}${out.skipped ? `, ${out.skipped} skipped` : ""}.` : out.error);
  };

  const saveProfile = () => showToast(writeProfile(profile) ? "Profile saved in this browser." : "Not saved: this browser blocks storage.");
  const reset = () => {
    resetProfile();
    setProfile(DEFAULT_PROFILE);
    showToast("Profile back to the defaults.");
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
      if (!k) return showToast("Paste your key first.");
      if (!k.startsWith("sk-ant-")) return showToast("That does not look like an Anthropic key (it starts with sk-ant-).");
    } else {
      if (!presetAvailable(preset, hostname)) return showToast("Ollama is not reachable from this site. Pick another endpoint.");
      if (!/^https?:\/\/\S+$/i.test(llm.openai.baseUrl.trim())) return showToast("Add the base URL first (it starts with https://).");
      if (!llm.openai.model.trim()) return showToast("Add the model name first.");
      if (preset.keyNeeded && !k) return showToast("Paste your key first.");
    }
    const settings = { ...llm, openai: { ...llm.openai, baseUrl: llm.openai.baseUrl.trim(), model: llm.openai.model.trim() } };
    const keyOk = provider === ANTHROPIC ? writeApiKey(k) : k ? writeOpenAiKey(k) : (clearOpenAiKey(), true);
    if (!writeLlmSettings(settings) || !keyOk) return showToast("Not saved: this browser blocks storage.");
    setLlm(settings);
    setSavedKeys({ ...savedKeys, [provider]: k });
    showToast("Provider and key saved in this browser.");
  };
  const removeKey = () => {
    if (provider === ANTHROPIC) clearApiKey();
    else clearOpenAiKey();
    setSavedKeys({ ...savedKeys, [provider]: "" });
    setKeys({ ...keys, [provider]: "" });
    showToast("Key removed from this browser.");
  };
  const keyHost = provider === ANTHROPIC ? "api.anthropic.com" : (() => {
    try { return new URL(llm.openai.baseUrl).host; } catch { return "the endpoint you set"; }
  })();

  return (
    <PageShell active="settings" demoMeals={demoMeals} router={router} toastState={toastState}>
      <section id="settings-page" className="tab-page space-y-8 max-w-[1360px] mx-auto px-8">
        <div>
          <span className="font-script text-3xl text-forest font-bold">Your Kitchen</span>
          <h1 className="font-serif text-4xl font-bold text-forest">Profile &amp; Settings</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Kitchen Profile */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-8 sm:p-10 shadow-soft border border-cream-dark space-y-8">
            <div>
              <span className="font-script text-2xl text-forest font-bold">How you cook</span>
              <h2 className="font-serif text-3xl font-bold text-forest">Kitchen Profile</h2>
              <p className="text-xs text-forest/70 mt-2">Every line here goes into the prompt for your ideas and recipes; the targets also fill in the Make Your Meal form. Empty a line to leave it out.</p>
            </div>
            {profile.sections.map((s) => (
              <div key={s.id} className="space-y-6 pt-2 border-t border-cream-dark first:border-t-0 first:pt-0">
                <h3 className="text-xs font-bold uppercase tracking-widest text-forest/50">{s.label}</h3>
                <div className={`grid grid-cols-1 gap-6${s.fields.every((f) => f.type === "number") ? " sm:grid-cols-2" : ""}`}>
                  {s.fields.map((f) => (
                    <Field key={f.id} field={f} onChange={(value) => setProfile((p) => setField(p, f.id, value))} />
                  ))}
                </div>
              </div>
            ))}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button onClick={saveProfile} className="flex-1 bg-lime hover:bg-lime-hover text-forest font-bold py-3 rounded-2xl text-sm transition-all shadow-glow">
                Save profile
              </button>
              <button onClick={reset} className="flex-1 bg-cream-card hover:bg-cream-dark text-forest font-bold py-3 rounded-2xl text-sm transition-colors border border-cream-dark">
                Reset to defaults
              </button>
            </div>
          </div>

          {/* API key */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-forest text-cream rounded-3xl p-6 sm:p-8 shadow-card space-y-5">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-key text-lime text-lg"></i>
                <h2 className="font-serif font-bold text-xl text-white">Your AI provider and key</h2>
              </div>
              <p className="text-xs text-cream/80 leading-relaxed">
                SmartBite uses your own key to write ideas and recipes. The key is stored only in this browser. It never leaves the browser except to {keyHost}, when you make a meal. Usage is billed to your account with that provider.
              </p>
              <div>
                <label htmlFor="llm-provider" className={darkLabel}>Provider</label>
                <select id="llm-provider" value={provider} disabled={!llm}
                  onChange={(e) => { setLlm((l) => ({ ...l, provider: e.target.value })); setShowKey(false); }} className={darkInput}>
                  <option value={ANTHROPIC}>Anthropic (Claude)</option>
                  <option value={OPENAI_COMPATIBLE}>OpenAI-compatible (experimental)</option>
                </select>
              </div>
              {llm && provider === ANTHROPIC && (
                <div>
                  <label htmlFor="llm-model" className={darkLabel}>Model</label>
                  <select id="llm-model" value={llm.anthropicModel} onChange={(e) => setLlm((l) => ({ ...l, anthropicModel: e.target.value }))} className={darkInput}>
                    {ANTHROPIC_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              )}
              {llm && provider === OPENAI_COMPATIBLE && (
                <div className="space-y-5">
                  <span id="llm-experimental" className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-forest bg-lime px-2 py-0.5 rounded-full">
                    <i className="fa-solid fa-flask text-[9px]"></i>{EXPERIMENTAL_LABEL}
                  </span>
                  <div>
                    <label htmlFor="llm-preset" className={darkLabel}>Endpoint</label>
                    <select id="llm-preset" value={preset.id} onChange={(e) => pickPreset(e.target.value)} className={darkInput}>
                      {OPENAI_PRESETS.map((p) => (
                        <option key={p.id} value={p.id} disabled={!presetAvailable(p, hostname)}>
                          {p.label}{presetAvailable(p, hostname) ? "" : " (not reachable from this site)"}
                        </option>
                      ))}
                    </select>
                    <span id="llm-cors-note" className="block text-[11px] text-cream/60 mt-2">
                      {presetAvailable(preset, hostname) ? preset.cors
                        : "Not offered here: Ollama blocks browser calls from other sites by default. Run SmartBite on your own computer, or start Ollama with OLLAMA_ORIGINS set to this site's address and use Other OpenAI-compatible endpoint."}
                    </span>
                  </div>
                  <div>
                    <label htmlFor="llm-base-url" className={darkLabel}>Base URL</label>
                    <input id="llm-base-url" type="url" value={llm.openai.baseUrl} onChange={(e) => setOpenAi({ baseUrl: e.target.value })}
                      autoComplete="off" spellCheck={false} placeholder="https://.../v1" className={darkInput} />
                  </div>
                  <div>
                    <label htmlFor="llm-openai-model" className={darkLabel}>Model</label>
                    <input id="llm-openai-model" type="text" value={llm.openai.model} onChange={(e) => setOpenAi({ model: e.target.value })}
                      autoComplete="off" spellCheck={false} placeholder="Model name from your provider" className={darkInput} />
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="api-key" className={darkLabel}>API key{provider === OPENAI_COMPATIBLE && !preset.keyNeeded ? " (if the endpoint needs one)" : ""}</label>
                <div className="flex items-center gap-2">
                  <input id="api-key" type={showKey ? "text" : "password"} value={key} onChange={(e) => setKeys({ ...keys, [provider]: e.target.value })}
                    autoComplete="off" spellCheck={false} placeholder={provider === ANTHROPIC ? "sk-ant-..." : "Your key for this endpoint"}
                    className="flex-1 bg-forest-card border border-cream/10 rounded-xl px-4 py-2.5 text-xs text-cream font-mono placeholder-cream/40 focus:outline-none focus:border-lime" />
                  <button onClick={() => setShowKey(!showKey)} aria-label={showKey ? "Hide key" : "Show key"}
                    className="w-10 h-10 rounded-xl bg-forest-card border border-cream/10 text-cream/70 hover:text-lime">
                    <i className={`fa-regular ${showKey ? "fa-eye-slash" : "fa-eye"} text-xs`}></i>
                  </button>
                </div>
                <span id="api-key-status" className="block text-[11px] text-cream/60 mt-2">
                  {savedKey ? `Saved in this browser (ends in ${savedKey.slice(-4)}).` : provider === ANTHROPIC ? "No key saved: Make Your Meal runs in demo mode." : "No key saved for this endpoint."}
                </span>
              </div>
              <div className="flex gap-3">
                <button onClick={saveProvider} disabled={!llm} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">Save provider and key</button>
                {savedKey && (
                  <button onClick={removeKey} className="text-xs font-bold text-cream/70 hover:text-lime px-3 py-2.5">Remove key</button>
                )}
              </div>
            </div>
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-4">
              <div>
                <span className="font-script text-2xl text-forest font-bold">Where you shop</span>
                <h2 className="font-serif font-bold text-xl text-forest">Region and supermarket</h2>
              </div>
              <div>
                <label htmlFor="price-country" className={label}>Country</label>
                <select id="price-country" value={country} onChange={(e) => pickCountry(e.target.value)} className={input}>
                  {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <span className="block text-[11px] text-forest/60 mt-1">
                  {country === "none"
                    ? "Only the prices you type count. The budget check waits for a price on every item."
                    : "Items you have not priced get the average price households paid in Spain over the latest 12 months published (MAPA household consumption panel). They show as est. on the recipe page; a price you type always wins."}
                </span>
              </div>
              <div>
                <label htmlFor="store" className={label}>Supermarket</label>
                <select id="store" value={store} onChange={(e) => pickStore(e.target.value)} className={input}>
                  <option value={NO_STORE}>No store</option>
                  {Object.values(STORES).flat().map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  <option value="other">Other</option>
                </select>
                {store === "other" && (
                  <input aria-label="Supermarket name" value={otherName} maxLength={40} placeholder="Supermarket name"
                    onChange={(e) => setOtherName(e.target.value)} onBlur={() => otherName.trim() && saveStore(`other:${otherName}`)}
                    className={`${input} mt-2`} />
                )}
                <span className="block text-[11px] text-forest/60 mt-1">
                  Prices and products you save go to this store. Foods you have no product for at this store use the ones you saved with no store, then the typical pack. SmartBite never contacts the store.
                </span>
              </div>
              <div className="space-y-2">
                <span className={label}>Your products</span>
                <p className="text-xs text-forest/80">
                  {total === 0 ? "None yet. Use Edit product on a shopping line, or type a price there."
                    : `${total} saved in this browser${counts[storeId] ? `, ${counts[storeId]} for ${storeLabel(storeId)}` : ""}.`}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={download} disabled={!total} className="bg-forest text-cream hover:bg-forest/90 disabled:opacity-40 font-bold text-xs px-4 py-2 rounded-xl transition-colors">Export products</button>
                  <label className="bg-cream-dark text-forest hover:bg-cream-dark/70 font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer">
                    Import products
                    <input type="file" accept="application/json,.json" onChange={upload} className="sr-only" />
                  </label>
                </div>
                <span className="block text-[11px] text-forest/60">A file to keep your products, or move them to another browser.</span>
              </div>
            </div>
            <div className="bg-cream-card rounded-3xl p-6 border border-cream-dark flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-lime text-forest flex items-center justify-center shrink-0 font-bold text-lg">
                <i className="fa-solid fa-lock"></i>
              </div>
              <div className="space-y-1">
                <h4 className="font-serif font-bold text-lg text-forest">No accounts</h4>
                <p className="text-xs text-forest/80 leading-relaxed">
                  Your profile, cart, saved meals and photos stay in this browser. <Link href="/privacy" className="font-bold underline hover:text-lime-hover">Read the privacy note</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
