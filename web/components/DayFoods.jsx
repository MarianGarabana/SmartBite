"use client";
// My Day "Foods" tab (decided 2026-11-21): search the foods SmartBite knows (English or Spanish names) and the user's
// saved products with a label, see the values per 100 g, type the grams (eggs: how many and the size) and add the
// food to the day. The nutrition table loads when the picker opens (lib/foods.js loadFoodTable). All math in
// lib/foods.js, the same as the engine's; nothing is sent anywhere.
import { useEffect, useMemo, useRef, useState } from "react";
import { EGG_GRAMS, EGG_SIZE, MAX_EGGS, MAX_FOOD_GRAMS, foodItem, gramsOf, loadFoodTable, readAmount, roundFood,
  macrosFor, searchFoods } from "../lib/foods";
import { readActiveProducts } from "../lib/store";

// Every string this tab shows, in one place
const TEXT = {
  searchLabel: "Search foods",
  searchPlaceholder: "Search foods, e.g. banana or platano...",
  loading: "Loading the food list...",
  loadFailed: "The food list did not load. Close this and try again.",
  noMatch: (q) => `No foods match "${q}".`,
  typeOwn: "Add your own food instead",
  yourProduct: "Your product",
  forFood: (food) => `For ${food}`,
  per100: "Per 100 g",
  perEgg: (size, grams) => `One egg, size ${size}, is ${grams} g`,
  kcal: "kcal",
  protein: "protein",
  carbs: "carbs",
  fat: "fat",
  source: "Values per 100 g from Ciqual 2025 and USDA FoodData Central. Your products use their label.",
  changeFood: "Change food",
  grams: "Grams",
  eggs: "Eggs",
  eggSize: "Egg size",
  amountHelp: (eggs) => (eggs ? `A whole number of eggs, 1 to ${MAX_EGGS}.` : `Grams of the food as you eat it, up to ${MAX_FOOD_GRAMS} g.`),
  preview: (amount) => `For ${amount}`,
  previewEmpty: (eggs) => (eggs ? "Type how many eggs to see the macros." : "Type the grams to see the macros."),
  cells: [["kcal", "Calories", ""], ["protein_g", "Protein", " g"], ["carbs_g", "Carbs", " g"], ["fat_g", "Fat", " g"],
    ["fiber_g", "Fiber", " g"]],
  noData: "no data",
  amountText: (value, eggs, size) => (eggs ? `${value} ${value === 1 ? "egg" : "eggs"}, size ${size}` : `${value} g`),
  errors: {
    empty: (eggs) => (eggs ? "Type how many eggs." : "Type the grams."),
    grams: () => `Grams must be a number above 0 and up to ${MAX_FOOD_GRAMS}.`,
    eggs: () => `Eggs must be a whole number from 1 to ${MAX_EGGS}.`,
  },
  add: (slot) => `Add to ${slot}`,
  cancel: "Cancel",
};

const fieldLabel = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2";
const fieldInput = "w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest";
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const g1 = (v) => Math.round(v * 10) / 10;
const per100Line = (p) => `${Math.round(p.kcal)} ${TEXT.kcal} · ${g1(p.protein_g)}g ${TEXT.protein} · ${g1(p.carbs_g)}g ${TEXT.carbs} · ${g1(p.fat_g)}g ${TEXT.fat}`;
const shownName = (r) => (r.kind === "food" ? cap(r.name) : r.name);

export default function DayFoods({ hidden, slot, demo, onAdd, onClose, onOwn }) {
  const [table, setTable] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadFoodTable().then((t) => live && setTable(t), () => live && setFailed(true));
    return () => { live = false; };
  }, []);
  // The demo never reads the user's own data
  const products = useMemo(() => (demo ? {} : readActiveProducts()), [demo]);

  const [query, setQuery] = useState("");
  const results = useMemo(() => searchFoods(query, { table, products }), [query, table, products]);
  const [picked, setPicked] = useState(null);
  const [amount, setAmount] = useState("");
  const [size, setSize] = useState(EGG_SIZE);
  const [error, setError] = useState("");
  const search = useRef(null);
  const list = useRef(null);
  const amountBox = useRef(null);
  const back = useRef(false);

  useEffect(() => {
    if (picked) amountBox.current?.focus();
    else if (back.current) { back.current = false; search.current?.focus(); }
  }, [picked]);

  const pick = (r) => { setPicked(r); setAmount(""); setSize(EGG_SIZE); setError(""); };
  const unpick = () => { back.current = true; setPicked(null); setError(""); };

  const buttons = () => [...(list.current?.querySelectorAll("button") || [])];
  const onSearchKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); buttons()[0]?.focus(); }
    if (e.key === "Enter" && results.length) { e.preventDefault(); pick(results[0]); }
  };
  const onListKey = (e) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const all = buttons();
    const i = all.indexOf(document.activeElement);
    if (e.key === "Home") return all[0]?.focus();
    if (e.key === "End") return all[all.length - 1]?.focus();
    if (e.key === "ArrowUp" && i <= 0) return search.current?.focus();
    all[Math.min(all.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))]?.focus();
  };

  const eggs = !!picked?.eggs;
  const read = readAmount(amount, eggs);
  const grams = read.ok ? gramsOf(read.value, eggs, size) : null;
  const shown = read.ok ? roundFood(macrosFor(picked.per100, grams)) : null;
  const amountText = read.ok ? TEXT.amountText(read.value, eggs, size) : "";
  const submit = (e) => {
    e.preventDefault();
    if (!read.ok) return setError(TEXT.errors[read.error](eggs));
    onAdd(foodItem({ ...picked, name: shownName(picked) }, grams, amountText));
  };

  return (
    <div id="day-panel-foods" role="tabpanel" aria-labelledby="day-tab-foods" hidden={hidden} className="space-y-4">
      {!picked ? (
        <>
          <div className="relative">
            <label htmlFor="day-food-search" className="sr-only">{TEXT.searchLabel}</label>
            <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-forest/40" aria-hidden="true"></i>
            <input ref={search} id="day-food-search" type="text" enterKeyHint="search" value={query} autoComplete="off"
              onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} placeholder={TEXT.searchPlaceholder}
              aria-controls="day-food-list" aria-describedby="day-food-status"
              className="w-full bg-white border border-cream-dark rounded-full pl-9 pr-4 py-2.5 text-sm text-forest placeholder-forest/40 focus:outline-none focus:border-forest" />
          </div>
          <div id="day-food-status" aria-live="polite">
            {failed ? (
              <p role="alert" className="text-xs font-bold text-red-700">{TEXT.loadFailed}</p>
            ) : !table ? (
              <p className="text-xs text-forest/70">{TEXT.loading}</p>
            ) : results.length === 0 ? (
              <div className="bg-cream-card border border-cream-dark rounded-2xl p-4 text-xs text-forest/80 space-y-2">
                <p>{TEXT.noMatch(query.trim())}</p>
                <button type="button" onClick={onOwn} className="font-bold underline hover:text-lime-hover">{TEXT.typeOwn}</button>
              </div>
            ) : null}
          </div>
          {table && results.length > 0 && (
            <ul id="day-food-list" ref={list} onKeyDown={onListKey} className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => pick(r)}
                    className="day-food w-full text-left bg-cream/50 border border-cream-dark hover:border-forest focus:outline-none focus-visible:border-forest focus-visible:ring-2 focus-visible:ring-forest/30 rounded-2xl px-4 py-3 flex items-center justify-between gap-3 transition-colors">
                    <span className="min-w-0">
                      {r.kind === "product" && (
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-forest/70">{TEXT.yourProduct}</span>
                      )}
                      <span className="block font-serif font-bold text-sm text-forest leading-snug break-words">{shownName(r)}</span>
                      {r.kind === "product" ? (
                        <span className="block text-[11px] text-forest/70 break-words">{TEXT.forFood(r.food)}</span>
                      ) : r.alt ? (
                        <span className="block text-[11px] text-forest/70 break-words">{r.alt}</span>
                      ) : null}
                      <span className="block text-[11px] text-forest/70 tabular-nums">{TEXT.per100}: {per100Line(r.per100)}</span>
                    </span>
                    <span className="w-8 h-8 shrink-0 rounded-full bg-forest text-lime flex items-center justify-center" aria-hidden="true">
                      <i className="fa-solid fa-plus text-[10px]"></i>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {table && <p className="text-[11px] text-forest/70">{TEXT.source}</p>}
        </>
      ) : (
        <form id="day-food-form" onSubmit={submit} noValidate className="space-y-4">
          <div className="bg-cream/50 border border-cream-dark rounded-2xl px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              {picked.kind === "product" && (
                <span className="block text-[10px] font-bold uppercase tracking-wider text-forest/70">{TEXT.yourProduct}</span>
              )}
              <p id="day-food-picked" className="font-serif font-bold text-base text-forest leading-snug break-words">{shownName(picked)}</p>
              <p className="text-[11px] text-forest/70 tabular-nums">{TEXT.per100}: {per100Line(picked.per100)}</p>
            </div>
            <button type="button" onClick={unpick}
              className="shrink-0 min-h-[44px] text-xs font-bold text-forest/70 hover:text-forest underline px-2">{TEXT.changeFood}</button>
          </div>

          <div className={eggs ? "grid grid-cols-2 gap-3" : ""}>
            <div>
              <label htmlFor="day-food-amount" className={fieldLabel}>{eggs ? TEXT.eggs : TEXT.grams}</label>
              <input ref={amountBox} id="day-food-amount" inputMode={eggs ? "numeric" : "decimal"} value={amount} autoComplete="off"
                onChange={(e) => { setAmount(e.target.value); setError(""); }} placeholder={eggs ? "2" : "100"}
                aria-describedby="day-food-help" aria-invalid={error ? "true" : undefined} className={fieldInput} />
            </div>
            {eggs && (
              <div>
                <label htmlFor="day-food-size" className={fieldLabel}>{TEXT.eggSize}</label>
                <select id="day-food-size" value={size} onChange={(e) => setSize(e.target.value)} className={fieldInput}>
                  {Object.entries(EGG_GRAMS).map(([s, g]) => <option key={s} value={s}>{s} ({g} g)</option>)}
                </select>
              </div>
            )}
          </div>
          <p id="day-food-help" className="text-[11px] text-forest/70">
            {TEXT.amountHelp(eggs)}{eggs ? ` ${TEXT.perEgg(size, EGG_GRAMS[size])}.` : ""}
          </p>

          <div id="day-food-preview" aria-live="polite" className="bg-cream-card border border-cream-dark rounded-2xl p-4 space-y-3">
            {shown ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-forest/70">
                  {TEXT.preview(eggs ? `${amountText} (${g1(grams)} g)` : amountText)}
                </p>
                <dl className="grid grid-cols-3 sm:grid-cols-5 gap-x-3 gap-y-3">
                  {TEXT.cells.map(([k, label, unit]) => (
                    <div key={k} id={`day-food-${k}`} className="min-w-0">
                      <dt className="text-[10px] uppercase font-bold text-forest/70">{label}</dt>
                      <dd className="text-forest tabular-nums">
                        {shown[k] === null ? <span className="text-xs text-forest/70">{TEXT.noData}</span>
                          : <><span className="font-serif font-bold text-lg">{shown[k]}</span><span className="text-xs text-forest/70">{unit}</span></>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="text-xs text-forest/70">{TEXT.previewEmpty(eggs)}</p>
            )}
          </div>

          {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">
              {TEXT.add(slot.label)}
            </button>
            <button type="button" onClick={onClose} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2.5">{TEXT.cancel}</button>
          </div>
        </form>
      )}
    </div>
  );
}
