"use client";
// Header, footer, toast, meal image and add button from the mockup (design freeze), shared by the main page,
// the recipe page and the profile and privacy pages. Markup and classes copied 1:1.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adjustApply, adjustInfo, adjustPreview, adjustReset, cartJobs, consolidate } from "../lib/cart";
import { mealRequest } from "../lib/cartmath";
import { cachedReply, evaluateCached, requestKey } from "../lib/engine";
import { toMeal } from "../lib/meal";
import { usePhoto } from "../lib/photos";
import { DEFAULT_CURRENCY, currencySymbol, engineEstimates, onStoreChange, readActiveProducts, readCart, readCurrency,
  readLocalMeals, readPrices, readSaved, writeCart } from "../lib/store";

export const TABS = [
  { id: "home", label: "Home" },
  { id: "recipes", label: "My Recipes" },
  { id: "make-meal", label: "Make Your Meal" },
  { id: "cart", label: "Cart" },
  { id: "how-it-works", label: "How It Works" },
];
export const EMPTY_CART = { meals: [], rows: [], totals: { bought: 0, used: 0, wasteGrams: 0, wasteCost: 0, unpriced: 0, priced: 0, optional: 0 },
  leftovers: [], leftoverRecipes: [] };
// Money in the user's currency (Profile): "€4.99", "£4.99", "CHF 4.99". Only the symbol changes, nothing is converted.
// The symbol comes from useCurrency, called at the top of each page; the server render and first paint show €.
let symbol = "€";
export const money = (v) => `${symbol}${symbol.length > 1 ? " " : ""}${v.toFixed(2)}`;
export const moneySymbol = () => symbol;
export function useCurrency() {
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  useEffect(() => {
    const read = () => setCurrency(readCurrency());
    read();
    return onStoreChange(read);
  }, []);
  symbol = currencySymbol(currency) || "€";
  return { currency, symbol };
}
export const grams = (v) => `${Math.round(v)}g`;

// Demo meals (from the server) plus the meals made and saved in this browser
export function useMeals(demoMeals) {
  const [local, setLocal] = useState({ ready: false, docs: {}, saved: [] });
  useEffect(() => {
    const read = () => setLocal({ ready: true, docs: readLocalMeals(), saved: readSaved() });
    read();
    return onStoreChange(read);
  }, []);
  const meals = useMemo(() => {
    const own = Object.entries(local.docs).flatMap(([slug, doc]) => {
      try {
        return [toMeal(slug, doc, { kind: "local", saved: local.saved.includes(slug) })];
      } catch {
        return []; // a broken stored meal is skipped, not fatal
      }
    });
    return [...demoMeals, ...own];
  }, [demoMeals, local]);
  return { meals, ready: local.ready };
}

// The user's products for their store, { food key: product }, read after the first render and on every storage change
export function useProducts() {
  const [products, setProducts] = useState({});
  useEffect(() => {
    const read = () => setProducts(readActiveProducts());
    read();
    return onStoreChange(read);
  }, []);
  return products;
}

// Prices of those products, { "<food>|<pack grams>": EUR }, read after the first render and on every storage change
export function usePrices() {
  const [prices, setPrices] = useState({});
  useEffect(() => {
    const read = () => setPrices(readPrices());
    read();
    return onStoreChange(read);
  }, []);
  return prices;
}

// Estimated prices for the engine ({ country, region }, lib/store.js engineEstimates), read after the first render
// and on every storage change. undefined until read, so the page does not ask the engine before it knows.
export function useEstimates() {
  const [estimates, setEstimates] = useState(undefined);
  useEffect(() => {
    const read = () => {
      const e = engineEstimates();
      setEstimates((old) => (old && old.country === e.country && old.region === e.region ? old : e));
    };
    read();
    return onStoreChange(read);
  }, []);
  return estimates;
}

// Saved meals run again by the engine (lib/cartmath.js mealRequest) for some servings with the user's products and
// estimates (useEstimates): jobs [{ id, meal, servings }], the id stays the same while servings or products change. Per id the reply is
// { slug, doc, docKey, servings, budget, pending, error }: while a new reply loads, the last one for that meal stays
// (doc, its request key and the servings it was for), so the page never falls back to the saved meal meanwhile.
// A reply to an older request never replaces a newer one. Asks after a short pause (typing), at once when the reply
// is cached or nothing is shown yet.
export function useEvaluations(jobs, products, estimates) {
  const wanted = estimates === undefined ? [] : jobs.map((j) => {
    const request = mealRequest(j.meal, j.servings, products, estimates);
    return { id: j.id, slug: j.meal.slug, servings: j.servings, request, key: requestKey(request),
      budget: request.form.budget_total_eur };
  });
  const sig = wanted.map((w) => `${w.id} ${w.key}`).join("\n");
  const [state, setState] = useState({}); // id -> { slug, key, doc, docKey, servings, error }
  const shown = useRef(state);
  shown.current = state;
  useEffect(() => {
    let live = true;
    const timers = wanted.map((w) => {
      const run = () => evaluateCached(w.request).then(
        (doc) => live && setState((s) => ({ ...s,
          [w.id]: { slug: w.slug, key: w.key, doc, docKey: w.key, servings: w.servings, error: null } })),
        (e) => live && setState((s) => ({ ...s,
          [w.id]: { ...(s[w.id]?.slug === w.slug ? s[w.id] : {}), slug: w.slug, key: w.key, error: e.message } })));
      if (cachedReply(w.key) || shown.current[w.id]?.slug !== w.slug) return run(), null;
      return setTimeout(run, 400);
    });
    return () => {
      live = false;
      timers.forEach((t) => t && clearTimeout(t));
    };
    // sig holds every id and request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return Object.fromEntries(wanted.map((w) => {
    const cached = cachedReply(w.key);
    const s = state[w.id]?.slug === w.slug ? state[w.id] : null;
    const last = { slug: w.slug, doc: s?.doc || null, docKey: s?.docKey || null, servings: s?.servings, budget: w.budget };
    if (cached) return [w.id, { ...last, doc: cached, docKey: w.key, servings: w.servings, pending: false, error: null }];
    return [w.id, { ...last, pending: s?.key !== w.key, error: s?.key === w.key ? s.error : null }];
  }));
}

// evaluate: run the cart meals through the engine like the recipe page does (same servings, products, country), so
// packs, estimates, totals and Adjust leftovers match it. Only the Cart needs it; other pages show the count.
export function useCart(showToast, meals, { evaluate = false } = {}) {
  // null until the browser storage is read (the server render shows an empty cart)
  const [stored, setStored] = useState(null);
  useEffect(() => {
    const read = () => setStored(readCart());
    read();
    return onStoreChange(read);
  }, []);
  const estimates = useEstimates();
  const replies = useEvaluations(evaluate && stored ? cartJobs(stored, meals) : [], stored?.products, estimates);
  const replySig = Object.entries(replies).map(([id, r]) => `${id} ${r.docKey}`).join("\n");
  // { entry ref: Meal } from the engine replies (lib/cart.js cartJobs)
  const evaluated = useMemo(() => Object.fromEntries(Object.entries(replies).filter(([, r]) => r.doc)
    .map(([id, r]) => [id, toMeal(r.slug, r.doc)])),
  // replySig holds every reply shown
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [replySig]);
  const cart = useMemo(() => (stored ? consolidate(stored, meals, evaluated) : EMPTY_CART), [stored, meals, evaluated]);
  const save = (next) => {
    setStored(next);
    if (!writeCart(next)) showToast("This browser blocks storage: the cart is kept until you reload.");
  };
  const add = (meal, servings) => {
    const c = readCart();
    save({ ...c, meals: [...c.meals, servings ? { slug: meal.slug, servings } : { slug: meal.slug }] });
    showToast(`Added "${meal.name}" to cart!`);
  };
  // The index is the row the page shows (only meals that still exist). Remove it only if that row still holds
  // the same meal; if the cart changed in another tab, show the fresh cart instead
  const remove = (index, slug) => {
    const c = readCart();
    const known = new Set(meals.map((m) => m.slug));
    const target = c.meals.filter((e) => known.has(e.slug))[index];
    if (!target || target.slug !== slug) {
      setStored(c);
      return showToast("Your cart changed in another window. Here it is now.");
    }
    save({ ...c, meals: c.meals.filter((e) => e !== target) });
    showToast("Meal removed from cart.");
  };
  const setOptional = (key, on) => {
    const c = readCart();
    const keys = c.optional.filter((k) => k !== key);
    save({ ...c, optional: on ? [...keys, key] : keys });
  };
  // Already at home: out of the list and total, Restore buys it again
  const setHave = (key, on, name) => {
    const c = readCart();
    const keys = c.have.filter((k) => k !== key);
    save({ ...c, have: on ? [...keys, key] : keys });
    showToast(on ? `"${name}" marked as already at home.` : `"${name}" is back in the list.`);
  };
  // "Adjust leftovers to meals": suggestions from code, previewed before anything changes
  const adjustSuggestions = () => adjustInfo(readCart(), meals, evaluated);
  const previewAdjust = (ids) => adjustPreview(readCart(), meals, ids, evaluated);
  const applyAdjust = (ids) => {
    save(adjustApply(readCart(), meals, ids, evaluated));
    showToast("Cart adjusted.");
  };
  const resetAdjust = () => {
    save(adjustReset(readCart(), meals, evaluated));
    showToast("Adjustments undone.");
  };
  return { cart, add, remove, setOptional, setHave, adjustSuggestions, previewAdjust, applyAdjust, resetAdjust };
}

export function useToast() {
  const [toast, setToast] = useState({ text: "Message notification", show: false });
  const timer = useRef(null);
  const showToast = useCallback((text) => {
    setToast({ text, show: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2500);
  }, []);
  return { toast, showToast };
}

// The photo the user added in this browser, else the demo photo, else a green placeholder with the meal name.
// label: show "AI-generated photo" on a demo photo made with AI (the parent is positioned)
export function MealImage({ meal, className, textClass = "text-sm", label = false }) {
  const photo = usePhoto(meal.slug);
  const src = photo || meal.images[0];
  if (src && !photo && meal.aiPhoto) {
    const img = <img src={src} alt={`${meal.name} (AI-generated photo)`} className={className} />;
    return label ? <>{img}<PhotoLabel /></> : img;
  }
  if (src) return <img src={src} alt={meal.name} className={className} />;
  return (
    <div className={`${className} bg-forest-light flex items-center justify-center p-3 text-center`}>
      <span className={`font-serif font-bold text-lime leading-snug ${textClass}`}>{meal.name}</span>
    </div>
  );
}

// Ideas and recipes come from a language model: always labelled
export function AiLabel({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-forest/60 bg-cream-card border border-cream-dark px-2 py-0.5 rounded-full ${className}`}>
      <i className="fa-solid fa-wand-magic-sparkles text-[9px]"></i>AI-generated
    </span>
  );
}

// Small label on demo photos made with an image model; same look as AiLabel
export function PhotoLabel() {
  return (
    <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-forest/60 bg-cream-card border border-cream-dark px-2 py-0.5 rounded-full">
      <i className="fa-solid fa-wand-magic-sparkles text-[9px]"></i>AI-generated photo
    </span>
  );
}

export function AddButton({ onAdd, className, children }) {
  const [added, setAdded] = useState(false);
  const click = () => {
    onAdd();
    setAdded(true);
    setTimeout(() => setAdded(false), 1800);
  };
  return (
    <button onClick={click} className={`${className}${added ? " bg-lime" : ""}`}>
      {added ? <span>Added ✓</span> : children}
    </button>
  );
}

export function Header({ active, onNavigate, cartCount }) {
  return (
    <header className="sticky top-0 z-50 bg-cream/95 backdrop-blur-md border-b border-forest/10 transition-all">
      <div className="max-w-[1360px] mx-auto px-8 h-20 flex items-center justify-between">
        <a href="/" onClick={(e) => { e.preventDefault(); onNavigate("home"); }} className="flex items-center gap-2.5 group">
          <div className="w-10 h-10 rounded-full bg-forest flex items-center justify-center text-lime group-hover:bg-lime group-hover:text-forest transition-colors shadow-sm">
            <i className="fa-solid fa-leaf text-base"></i>
          </div>
          <span className="font-serif text-2xl font-bold tracking-tight text-forest">
            Smart<span className="font-normal italic">Bite</span>{" "}
            <span className="inline-block w-2 h-2 rounded-full bg-lime ml-0.5"></span>
          </span>
        </a>

        <nav className="flex items-center gap-2 font-medium text-sm">
          {TABS.map((t) => {
            const isActive = active === t.id;
            const extra = t.id === "make-meal" ? " flex items-center gap-1.5" : t.id === "cart" ? " relative" : "";
            return (
              <button
                key={t.id}
                id={`nav-${t.id}`}
                onClick={() => onNavigate(t.id)}
                className={`nav-btn px-4 py-2 rounded-full hover:text-forest hover:bg-forest/5 transition-all${extra} ${
                  isActive ? "font-semibold bg-forest/5 text-forest" : "text-forest/70"
                }`}
              >
                {t.id === "make-meal" ? (
                  <>
                    <span>Make Your Meal</span>
                    <span className="w-2 h-2 rounded-full bg-lime"></span>
                  </>
                ) : (
                  t.label
                )}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-4">
          <Link href="/profile" aria-label="Profile" title="Profile"
            className={`w-9 h-9 rounded-full flex items-center justify-center hover:text-forest hover:bg-forest/5 transition-all ${active === "profile" ? "bg-forest/5 text-forest" : "text-forest/70"}`}>
            <i className="fa-solid fa-user text-sm"></i>
          </Link>
          <button onClick={() => onNavigate("cart")} className="relative px-4 py-2 rounded-full bg-forest text-cream hover:bg-forest-light transition-all flex items-center gap-2.5 shadow-sm">
            <i className="fa-solid fa-basket-shopping text-lime text-sm"></i>
            <span className="text-xs font-bold">Cart</span>
            <span id="cart-badge" className="bg-lime text-forest font-bold text-[11px] px-2 py-0.5 rounded-full min-w-[20px] text-center">{cartCount}</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer({ onNavigate }) {
  return (
    <footer className="bg-forest text-cream pt-10 pb-8 px-8 border-t border-forest-light mt-12">
      <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <a href="/" onClick={(e) => { e.preventDefault(); onNavigate("home"); }} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-lime text-forest flex items-center justify-center text-xs font-bold">
            <i className="fa-solid fa-leaf"></i>
          </div>
          <span className="font-serif text-xl font-bold tracking-tight text-white">
            Smart<span className="font-normal italic">Bite</span>
          </span>
        </a>
        <nav className="flex items-center gap-6 text-xs text-cream/70 font-medium">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => onNavigate(t.id)} className="hover:text-lime transition-colors">{t.label}</button>
          ))}
          <Link href="/profile" className="hover:text-lime transition-colors">Profile</Link>
          <Link href="/privacy" className="hover:text-lime transition-colors">Privacy</Link>
        </nav>
        <p className="text-[11px] text-cream/40">© 2026 SmartBite. Whole-pack meal planner. Open source, AGPL-3.0.</p>
      </div>
    </footer>
  );
}

export function Toast({ toast }) {
  return (
    <div id="toast-msg" className={`fixed bottom-6 right-6 z-50 bg-forest text-cream px-5 py-3.5 rounded-2xl shadow-2xl border border-lime/30 flex items-center gap-3 transform transition-all pointer-events-none${toast.show ? "" : " translate-y-20 opacity-0"}`}>
      <div className="w-7 h-7 rounded-full bg-lime text-forest flex items-center justify-center font-bold text-xs">
        <i className="fa-solid fa-check"></i>
      </div>
      <span id="toast-text" className="text-xs font-semibold">{toast.text}</span>
    </div>
  );
}

// Shell for the pages outside the tabs (profile, privacy): same header, footer and toast
export function PageShell({ active, demoMeals, router, children, toastState }) {
  const { meals } = useMeals(demoMeals);
  const { cart } = useCart(toastState.showToast, meals);
  const go = (tab) => router.push(tab === "home" ? "/" : `/?tab=${tab}`);
  return (
    <div className="desktop-frame flex flex-col justify-between">
      <Header active={active} onNavigate={go} cartCount={cart.meals.length} />
      <main className="flex-1 py-6">{children}</main>
      <Footer onNavigate={go} />
      <Toast toast={toastState.toast} />
    </div>
  );
}
