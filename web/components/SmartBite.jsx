"use client";
// Port of the SmartBite desktop mockup (design freeze). Markup and classes are copied 1:1; the data is the demo
// meals plus what this browser keeps (cart, saved meals) in localStorage.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { checkForm } from "../lib/form";
import { makeMeal, progressText } from "../lib/flow";
import { generateIdeas, photoMaker, reviseIdea } from "../lib/llm";
import { deletePhoto, makePhoto } from "../lib/photos";
import { listText } from "../lib/packs";
import { demoIdea, demoPicks, estimateLabel, estimateTitle, recipeMeals, toMeal } from "../lib/meal";
import { fieldValue } from "../lib/profile";
import { tabUrl } from "../lib/site";
import { DEFAULT_BUDGET, deleteLocalMeal, engineEstimates, profileComplete, readActiveProducts, readBudget, readLlm, readProfile, saveLocalMeal }
  from "../lib/store";
import { SETUP_DONE_EVENT, openSetup } from "./SetupDialog";
import { AddButton, AiLabel, Footer, Header, MealPhoto, CART_TABLE as T, TABS, Toast, money, moneySymbol, grams, useCart, useCurrency, useDemo, useMeals, usePrices,
  useProfileComplete, useToast } from "./Chrome";
import { PasteRecipe } from "./PasteRecipe";
import { ProductCell, ProductDialog } from "./ProductDialog";
import { PriceInput } from "./RecipePage";

// Price cell of a Cart row: a typed price as text; no price or an estimate (grey, "est.", as on the recipe page) as
// the price field. The field stays while it has focus, so typing "4.99" is not cut off once the "4" is a price.
function CartPrice({ item, prices, onBlocked, priceClass }) {
  const [editing, setEditing] = useState(false);
  if (item.hasPrice && !item.estimate && !editing) return <span className={priceClass}>{money(item.price)}</span>;
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <PriceInput row={item} prices={prices} onBlocked={onBlocked} onFocus={() => setEditing(true)} onBlur={() => setEditing(false)} />
      {item.hasPrice ? (
        <span className={`min-w-[3.25rem] text-right whitespace-nowrap${item.estimate ? " font-normal text-forest/70" : ""}`} title={item.estimate ? estimateTitle(item.pricePeriod, item.priceRegion) : undefined}>
          {money(item.price)}{item.estimate ? <> <span className="text-[10px]">est.</span></> : null}
        </span>
      ) : null}
    </span>
  );
}

// Home category tiles (Marian, 2026-11-14, option A of her preview): square crops of demo meal photos, kept apart from
// /demo/images so Home loads no demo meal files
const CATEGORIES = [
  { name: "Breakfast", img: "/img/categories/breakfast.jpg" },
  { name: "Lunch", img: "/img/categories/lunch.jpg" },
  { name: "Dinner", img: "/img/categories/dinner.jpg" },
  { name: "Salads", img: "/img/categories/salads.jpg" },
  { name: "Warm Meals", img: "/img/categories/warm-meals.jpg" },
];
// Meals show their category if they have one, else their date; "~" marks totals read as "about"
const label = (m) => m.category || m.date;
const kcal = (m) => `${m.approx ? "~" : ""}${m.kcal} kcal`;
const protein = (m) => `${m.approx ? "~" : ""}${m.protein}g`;

// "How SmartBite works" steps on Home (Marian, 2026-11-14): the real flow, with the AI steps named as AI. One step is
// open at a time; hovering a step opens it (her ask), and click or keyboard focus does too for touch and keyboards.
const HOME_STEPS = [
  ["fa-brain", "Tell us what you're craving", "Say what you feel like eating, what to leave out, and your calorie, protein and budget targets."],
  ["fa-robot", "AI suggests 4 ideas", "Four meal ideas made for your targets. Pick one, or tell the AI what to change."],
  ["fa-wand-magic-sparkles", "AI writes the recipe", "Every ingredient in grams, with the steps to cook it."],
  ["fa-calculator", "Code does the math", "Each ingredient is matched to a typical pack size. Macros, vitamins and minerals are calculated, never guessed."],
  ["fa-basket-shopping", "One cart, less waste", "Add meals to one cart for a shopping list in whole packs, then turn the leftovers into more meals."],
];
function HomeSteps() {
  const [open, setOpen] = useState(0);
  return (
    <ol className="space-y-3">
      {HOME_STEPS.map(([icon, title, text], i) => {
        const on = open === i;
        return (
          <li key={title}>
            <button type="button" onClick={() => setOpen(i)} onMouseEnter={() => setOpen(i)} onFocus={() => setOpen(i)} aria-expanded={on}
              className={`w-full text-left rounded-2xl border px-4 py-3 sm:px-5 sm:py-4 transition-colors duration-300 ${on ? "bg-forest border-forest text-cream shadow-lg" : "bg-white border-cream-dark text-forest hover:border-forest/40"}`}>
              <span className="flex items-center gap-4">
                <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors duration-300 ${on ? "bg-lime text-forest" : "bg-forest text-lime"}`}>
                  <i className={`fa-solid ${icon} text-sm`} aria-hidden="true"></i>
                </span>
                <span className="flex-1 font-bold">{title}</span>
                <span className={`text-xs font-bold tabular-nums ${on ? "text-lime" : "text-forest/50"}`}>{String(i + 1).padStart(2, "0")}</span>
              </span>
              <span className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${on ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <span className="overflow-hidden">
                  <span className="block pt-2 pl-14 text-sm text-cream/85 leading-relaxed">{text}</span>
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// The two ways in before the real app can make meals (decided 2026-10-30): set up the profile, or try the demo.
// On home and in an empty My Recipes (Make Your Meal sends people to /start instead); same card as "How SmartBite
// Works". Button wording as on /start (decided 2026-10-31).
function SetupChoices({ id, onSetUp }) {
  return (
    <div id={id} className="bg-cream-card rounded-3xl p-8 border border-cream-dark flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-forest/70">Get started</span>
        <h3 className="font-serif text-2xl font-bold text-forest">Set up your profile first</h3>
        <p className="text-xs text-forest/70 max-w-2xl">Your AI key and your preferences, saved only in this browser. No key? Try the demo with example meals.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3 md:shrink-0">
        <button onClick={onSetUp} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-6 py-3 rounded-full transition-all whitespace-nowrap">
          Use my API key
        </button>
        <Link href="/demo" className="bg-forest hover:bg-forest-light text-lime font-bold text-xs px-6 py-3 rounded-full transition-all whitespace-nowrap">
          Try the demo
        </Link>
      </div>
    </div>
  );
}

// The same shell runs the real app (/) and the demo (/demo, inside DemoMode): the demo shows only the demo meals and
// its own cart; the real app only the meals made in this browser, and Make Your Meal once the profile is complete.
export default function SmartBite({ demoMeals = [], homeMeals = [], initialTab = "home", initialCategory = "All" }) {
  useCurrency();
  const demo = useDemo();
  const complete = useProfileComplete(); // null until read
  const [tab, setTab] = useState(initialTab);
  const [category, setCategory] = useState(CATEGORIES.some((c) => c.name === initialCategory) ? initialCategory : "All");
  const [query, setQuery] = useState("");
  const [pasting, setPasting] = useState(false); // the Paste a recipe box on My Recipes
  const { toast, showToast } = useToast();
  const { meals } = useMeals(demoMeals);
  const { cart, add: addToCart, remove: removeFromCart, setOptional, setHave, adjustSuggestions, previewAdjust,
    applyAdjust, resetAdjust } = useCart(showToast, meals, { evaluate: true });
  const optionalRows = cart.rows.filter((r) => r.optional && r.packSize && !r.have);
  // Prices can be typed in the Cart too (same field as the recipe page); a typed price prices every meal's lines
  const prices = usePrices();
  const priceBlocked = () => showToast("Not saved: this browser blocks storage.");
  const [editing, setEditing] = useState(null); // Cart row whose product is being edited
  const haveRows = cart.rows.filter((r) => r.have);
  // A row priced with an estimate that counts in the total, for the note under the list
  const estRow = cart.rows.find((r) => r.estimate && r.hasPrice && !r.have && (!r.optional || r.included));
  const estRegion = cart.rows.find((r) => r.estimate && r.priceRegion)?.priceRegion;
  // Copy, Share (phones and browsers that have it) and Print for the shopping list
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);
  const listCopy = () => navigator.clipboard.writeText(listText(cart.rows, cart.totals, money))
    .then(() => showToast("Shopping list copied.")).catch(() => showToast("Could not copy. Use Print instead."));
  const listShare = () => navigator.share({ title: "Shopping list", text: listText(cart.rows, cart.totals, money) })
    .catch(() => {}); // closed without sharing
  // "Adjust leftovers to meals": suggestions from code, previewed before anything changes
  const [adjust, setAdjust] = useState(null);
  const openAdjust = () => {
    const out = adjustSuggestions();
    setAdjust({ ...out, picked: out.suggestions.map((x) => x.id) });
  };
  const togglePick = (id) => {
    const picked = adjust.picked.includes(id) ? adjust.picked.filter((x) => x !== id) : [...adjust.picked, id];
    setAdjust({ ...adjust, picked, after: previewAdjust(picked) });
  };
  // Leftovers before and after: in money when prices exist, else in grams
  const leftValue = (sum) => (sum.priced ? money(sum.leftCost) : grams(sum.wasteGrams));
  const pct = (from, to) => `${to > from ? "+" : ""}${Math.round(((to - from) / from) * 100)}%`;
  const bySlug = Object.fromEntries(meals.map((m) => [m.slug, m]));

  // The address shows the tab (/?tab=cart or /demo?tab=cart, as the other pages link back), so Back and shared links work
  const switchTab = (id) => {
    setTab(id);
    const url = tabUrl(id, demo);
    if (window.location.pathname + window.location.search !== url) window.history.pushState(null, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const onBack = () => {
      const id = new URLSearchParams(window.location.search).get("tab");
      setTab(TABS.some((t) => t.id === id) ? id : "home");
    };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);
  // A new visitor has no recipes of their own yet: a category opens the demo recipes instead of an empty page
  const openCategory = (name) => {
    if (!demo && own.length === 0) return router.push(`${tabUrl("recipes", true)}&category=${encodeURIComponent(name)}`);
    switchTab("recipes");
    setCategory(name);
  };
  const setUp = () => openSetup((state, opts) => state === "done" && !opts?.profile && profileComplete() && switchTab("make-meal"));
  // The real Make Your Meal waits for a complete profile (decided 2026-10-31): until then it sends people to /start
  const router = useRouter();
  useEffect(() => {
    if (!demo && complete === false && tab === "make-meal") router.replace("/start");
  }, [demo, complete, tab, router]);

  // The demo lists the demo meals; the real app the meals made in this browser once saved ("Save in my recipes").
  const q = query.toLowerCase();
  const own = recipeMeals(meals, false);
  const homeList = demo ? homeMeals : own.slice(-5).reverse(); // real app: the last five saved
  const shown = recipeMeals(meals, demo).filter(
    (m) =>
      (category === "All" || m.categories.includes(category)) &&
      (!q || m.name.toLowerCase().includes(q) || m.ingredients.some((i) => i.name.toLowerCase().includes(q)))
  );

  return (
    <div className="desktop-frame flex flex-col justify-between">
      {/* HEADER / NAVIGATION BAR */}
      <Header active={tab} onNavigate={switchTab} cartCount={cart.meals.length} />

      <main className="flex-1 py-6">
        {demo && (
          <div className="max-w-[1360px] mx-auto px-8 mb-6">
            <div id="demo-banner" className="bg-cream-card rounded-2xl p-4 border border-cream-dark text-xs text-forest/80">
              <span className="font-bold text-forest">Demo mode.</span> Example meals made ahead, no AI key needed.{" "}
              <Link href="/start" className="font-bold underline hover:text-lime-hover">Make your own meals</Link>
            </div>
          </div>
        )}

        {/* TAB 1: HOME */}
        <section id="tab-home" className={`tab-page space-y-12${tab === "home" ? "" : " hidden"}`}>
          {/* Hero on one photo, text straight on its empty side (Marian, 2026-11-14, after a Greenify reference she liked):
              her Unsplash flat lay, mirrored so the food sits on the right. Forest scrim from the left keeps the words readable. */}
          <div className="max-w-[1360px] mx-auto px-4 sm:px-8">
            <div id="home-photo" className="relative isolate overflow-hidden rounded-[2rem] sm:rounded-[2.5rem] shadow-xl bg-forest">
              <img src="/img/home/hero.jpg" alt="" fetchPriority="high" decoding="async" className="absolute inset-0 -z-10 w-full h-full object-cover object-right" />
              <div className="absolute inset-0 -z-10 bg-forest/75 sm:bg-transparent sm:bg-gradient-to-r sm:from-forest/90 sm:via-forest/60 sm:to-transparent" aria-hidden="true"></div>
              <div className="text-cream px-7 py-12 sm:px-12 sm:py-20 lg:px-16 lg:py-24 max-w-[720px] space-y-6">
                <span className="inline-block px-3.5 py-1.5 rounded-full bg-forest/60 border border-lime/40 text-lime text-xs font-semibold tracking-wider">
                  Whole-pack meal planner
                </span>
                <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.12] text-white">
                  Meals that fit{" "}
                  <span className="font-script text-lime text-5xl sm:text-6xl block -rotate-2 mt-1 mb-2">your macros</span>
                  and your budget.
                </h1>
                <p className="text-cream/90 text-base sm:text-lg max-w-xl leading-relaxed">
                  Tell SmartBite what you feel like eating. It writes a recipe in grams and a shopping list in whole packs, with the macros calculated for you.
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <button onClick={() => switchTab("make-meal")} className="bg-cream hover:bg-lime text-forest font-bold text-base px-8 py-4 rounded-full transition-all duration-300 shadow-lg flex items-center gap-3">
                    <span>Make your meal</span>
                    <i className="fa-solid fa-arrow-right text-sm"></i>
                  </button>
                  {/* Demo button on home (Marian, 2026-11-10): the real app only; the demo is already the demo.
                      It replaces the "Set up your profile first" card here (2026-11-14): Make your meal opens /start */}
                  {!demo && (
                    <Link id="hero-demo" href="/demo" className="border-2 border-cream/50 hover:border-cream hover:bg-cream/10 text-cream font-bold text-base px-8 py-[14px] rounded-full transition-all duration-300 flex items-center gap-3">
                      <i className="fa-solid fa-play text-sm"></i>
                      <span>Try the demo</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Explore Categories as big photo tiles (Marian, 2026-11-14, option A): name on a dark fade, hover zooms the photo
              and shows an arrow. The photos are AI-generated demo photos, so the row carries one label like elsewhere. */}
          <div className="max-w-[1360px] mx-auto px-4 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
              <div>
                <span className="font-script text-2xl sm:text-3xl text-forest font-bold block">Recipe collection</span>
                <h2 className="font-serif text-3xl sm:text-4xl font-bold text-forest">Explore Categories</h2>
              </div>
              <AiLabel text="AI-generated photos" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
              {CATEGORIES.map((c, i) => (
                <button key={c.name} onClick={() => openCategory(c.name)}
                  className={`group relative isolate h-52 sm:h-64 lg:h-80 rounded-[1.6rem] overflow-hidden text-left shadow-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime${i === CATEGORIES.length - 1 ? " col-span-2 md:col-span-1" : ""}`}>
                  <img src={c.img} alt="" loading="lazy" decoding="async"
                    className="absolute inset-0 -z-10 w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.07] motion-reduce:transition-none" />
                  <span className="absolute inset-0 -z-10 bg-gradient-to-t from-forest/90 via-forest/10 to-transparent" aria-hidden="true"></span>
                  <span className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-2">
                    <span className="font-serif font-bold text-lg lg:text-xl text-white leading-tight">{c.name}</span>
                    <span className="w-9 h-9 shrink-0 rounded-full bg-lime text-forest flex items-center justify-center opacity-0 translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 group-focus-visible:translate-x-0" aria-hidden="true">
                      <i className="fa-solid fa-arrow-right text-sm"></i>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {homeList.length > 0 ? (
          <div className="max-w-[1360px] mx-auto px-8 pt-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="font-script text-2xl text-forest font-bold">{demo ? "Pre-built examples" : "Saved in this browser"}</span>
                <h2 className="font-serif text-3xl font-bold text-forest">{demo ? "Demo Meals" : "Your Meals"}</h2>
              </div>
              <button onClick={() => switchTab("recipes")} className="text-xs font-bold text-forest hover:text-lime-hover flex items-center gap-1.5">
                <span>View all recipes</span>
                <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>
            <div id="home-kitchen-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              {homeList.map((m) => (
                <div key={m.slug} className="relative bg-white rounded-3xl overflow-hidden shadow-soft border border-cream-dark/60 flex flex-col justify-between group">
                  <MealPhoto meal={m} label frameClass="h-40 overflow-hidden relative" imgClass="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    fallback={<div className="px-4 pt-4"><span className="inline-block bg-forest text-lime font-bold text-[10px] px-2.5 py-0.5 rounded-full">{kcal(m)}</span></div>}>
                    <span className="absolute top-2.5 left-2.5 bg-forest/90 text-lime font-bold text-[10px] px-2.5 py-0.5 rounded-full">{kcal(m)}</span>
                  </MealPhoto>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-forest/70 block">{label(m)}</span>
                      <h4 className="font-serif font-bold text-sm text-forest leading-snug line-clamp-2 mt-0.5"><Link href={`/recipes/${m.slug}`} className="after:absolute after:inset-0">{m.name}</Link></h4>
                    </div>
                    <div className="mt-3 pt-2 border-t border-cream-dark flex items-center justify-between">
                      <span className="text-xs font-bold text-forest">Protein: {protein(m)}</span>
                      <AddButton onAdd={() => addToCart(m)} className="relative z-10 bg-cream-card hover:bg-lime text-forest font-bold px-3 py-1.5 rounded-xl text-xs transition-colors">
                        Add to cart
                      </AddButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          ) : null}

          {/* Why I built SmartBite + How it works at the bottom (Marian, 2026-11-14, after a Healora reference she liked):
              on the page background, text on one side and a rounded photo on the other, alternating sides. */}
          <div className="max-w-[1360px] mx-auto px-4 sm:px-8 pt-4 space-y-16 sm:space-y-24">
            {/* Why SmartBite exists (Marian, 2026-11-14): her reason for building it, for people trying the app */}
            <div id="home-why" className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
              <div className="lg:col-span-7 space-y-5">
                <span className="font-script text-3xl text-forest font-bold block">Why I built SmartBite</span>
                <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-forest leading-tight">I wanted my meal prep to take less time.</h2>
                <p className="text-base text-forest/75 leading-relaxed max-w-2xl">
                  Every week I planned my meal prep recipes by hand, and it took too long. I wanted each meal to give me the macros and nutrients I need for the day, at a price that fits my budget.
                </p>
                <p className="text-base text-forest/75 leading-relaxed max-w-2xl">
                  I also wanted to use every pack I buy, so food doesn't go to waste. SmartBite does that for me: tell it what you feel like eating, and it gives you the recipe, the shopping list and a plan for the leftovers.
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-7 pt-4">
                  {[
                    ["fa-clock", "Faster meal prep", "A full recipe in grams in a few minutes, not an evening of planning."],
                    ["fa-dumbbell", "Your macros and nutrients", "Each meal is built around your calorie and protein targets, with vitamins and minerals listed."],
                    ["fa-wallet", "Budget-friendly meals", "Everyday ingredients and a shopping list in whole packs."],
                    ["fa-leaf", "Less food waste", "A plan for what is left in each pack, so nothing gets thrown out."],
                  ].map(([icon, title, line]) => (
                    <li key={title} className="flex items-start gap-4">
                      <span className="w-10 h-10 shrink-0 rounded-full bg-forest text-lime flex items-center justify-center">
                        <i className={`fa-solid ${icon} text-sm`} aria-hidden="true"></i>
                      </span>
                      <div className="space-y-1 pt-2">
                        <h3 className="font-bold text-forest leading-tight">{title}</h3>
                        <p className="text-sm text-forest/70 leading-relaxed">{line}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <img src="/img/home/why.jpg" alt="Three glass meal prep containers with lentils, corn, tomato and cucumber" loading="lazy" decoding="async"
                className="lg:col-span-5 w-full aspect-[4/3] lg:aspect-[4/5] object-cover rounded-[2rem] shadow-xl" />
            </div>

            <div id="home-how" className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
              <div className="space-y-5 lg:order-2">
                <span className="font-script text-3xl text-forest font-bold block">How SmartBite works</span>
                <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-forest leading-tight">From craving to shopping list in 5 steps</h2>
                <p className="text-base text-forest/75 leading-relaxed max-w-xl">
                  AI picks the foods and grams; code does all the math.
                </p>
                <HomeSteps />
                <div className="pt-3">
                  <button onClick={() => switchTab("how-it-works")} className="bg-forest hover:bg-forest-light text-lime font-bold text-sm px-6 py-3 rounded-full transition-all whitespace-nowrap">
                    Learn How It Works
                  </button>
                </div>
              </div>
              <img src="/img/home/how.jpg" alt="Bowls of diced potato, carrot and green beans ready to cook" loading="lazy" decoding="async"
                className="w-full aspect-[4/3] lg:aspect-square object-cover rounded-[2rem] shadow-xl lg:order-1" />
            </div>
          </div>
        </section>

        {/* TAB 2: MY RECIPES */}
        <section id="tab-recipes" className={`tab-page space-y-8 max-w-[1360px] mx-auto px-8${tab === "recipes" ? "" : " hidden"}`}>
          <div>
            <span className="font-script text-3xl text-forest font-bold">{demo ? "Demo Meals" : "Saved Meals"}</span>
            <h1 className="font-serif text-4xl font-bold text-forest">My Recipes</h1>
            {/* Saved meals live only in this browser (decided 2026-11-01): the profile file is the copy */}
            {!demo && own.length > 0 && (
              <p id="recipes-kept" className="text-xs text-forest/70 mt-2">
                Your meals are kept in this browser only.{" "}
                <Link href="/profile#profile-file" className="font-bold underline hover:text-lime-hover">Save a profile file</Link>{" "}
                to keep a copy or move them to another device.
              </p>
            )}
          </div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0" id="recipe-filter-chips">
              {["All", ...CATEGORIES.map((c) => c.name)].map((name) =>
                name === category ? (
                  <button key={name} onClick={() => setCategory(name)} className="chip-btn active-chip bg-forest text-lime font-semibold px-4 py-2 rounded-full text-xs transition-all">{name}</button>
                ) : (
                  <button key={name} onClick={() => setCategory(name)} className="chip-btn bg-white hover:bg-cream-dark text-forest font-medium px-4 py-2 rounded-full text-xs transition-all border border-cream-dark">{name}</button>
                )
              )}
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-72 md:flex-none">
                <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-forest/40"></i>
                <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes or ingredients..." className="w-full bg-white border border-cream-dark rounded-full pl-9 pr-4 py-2 text-xs text-forest placeholder-forest/40 focus:outline-none focus:border-forest" />
              </div>
              {/* Paste a recipe (decided 2026-11-09, Q14): the real app only, not the demo */}
              {!demo && (
                <button id="paste-recipe" onClick={() => setPasting(true)}
                  className="shrink-0 bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-4 py-2 rounded-full transition-all flex items-center gap-1.5">
                  <i className="fa-solid fa-paste text-[11px]"></i>
                  <span>Paste a recipe</span>
                </button>
              )}
            </div>
          </div>
          {pasting && <PasteRecipe onClose={() => setPasting(false)} />}
          <div id="recipes-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {shown.map((m) => (
              <div key={m.slug} className="relative bg-white rounded-3xl overflow-hidden shadow-soft border border-cream-dark/60 flex flex-col justify-between group">
                {m.kind === "local" && <CardMenu meal={m} showToast={showToast} />}
                <MealPhoto meal={m} label frameClass="h-44 overflow-hidden relative" imgClass="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  fallback={<div className="px-5 pt-5"><span className="inline-block bg-forest text-lime font-bold text-xs px-3 py-1 rounded-full">{kcal(m)}</span></div>}>
                  <span className="absolute top-3 left-3 bg-forest/90 text-lime font-bold text-xs px-3 py-1 rounded-full">{kcal(m)}</span>
                </MealPhoto>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-forest/70">{label(m)}</span>
                    <h3 className="font-serif font-bold text-base text-forest mt-0.5 leading-snug"><Link href={`/recipes/${m.slug}`} className="after:absolute after:inset-0">{m.name}</Link></h3>
                  </div>
                  <div className="pt-3 border-t border-cream-dark flex items-center justify-between">
                    <span className="text-xs font-bold text-forest">Protein: {protein(m)}</span>
                    <AddButton onAdd={() => addToCart(m)} className="relative z-10 bg-cream-card hover:bg-lime text-forest font-bold px-3.5 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5">
                      <i className="fa-solid fa-plus text-[10px]"></i>
                      <span>Add to cart</span>
                    </AddButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {!demo && complete === false && own.length === 0 && <SetupChoices id="recipes-setup" onSetUp={setUp} />}
        </section>

        {/* TAB 3: MAKE YOUR MEAL */}
        <MakeMealStep1 hidden={tab !== "make-meal"} showToast={showToast} leftovers={cart.leftovers}
          demoMeals={meals.filter((m) => m.kind === "demo")} demo={demo} complete={complete} />

        {/* TAB 4: CART */}
        <section id="tab-cart" className={`tab-page space-y-8 max-w-[1360px] mx-auto px-8${tab === "cart" ? "" : " hidden"}`}>
          <div>
            <span className="font-script text-3xl text-forest font-bold">Grocery Plan</span>
            <h1 className="font-serif text-4xl font-bold text-forest">My Cart</h1>
          </div>

          <div id="cart-empty-state" className={`bg-white rounded-3xl p-12 text-center border border-cream-dark space-y-4 max-w-xl mx-auto my-12${cart.meals.length ? " hidden" : ""}`}>
            <div className="w-16 h-16 rounded-full bg-cream-card text-forest/40 flex items-center justify-center mx-auto text-2xl">
              <i className="fa-solid fa-basket-shopping"></i>
            </div>
            <h3 className="font-serif font-bold text-xl text-forest">Your cart is empty</h3>
            <p className="text-xs text-forest/70">{demo ? "Add a demo meal to build your shopping list." : "Make your first meal to build your shopping list."}</p>
            <button onClick={() => switchTab("make-meal")} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-6 py-3 rounded-full transition-all">
              Make your first meal
            </button>
          </div>

          <div id="cart-loaded-view" className={`grid grid-cols-1 lg:grid-cols-12 gap-8${cart.meals.length ? "" : " hidden"}`}>
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-xl text-forest">Added Meals</h3>
                {cart.meals.some((m) => m.adjusted) && (
                  <button onClick={resetAdjust} className="text-xs font-bold text-forest/70 hover:text-forest">Undo adjustments</button>
                )}
              </div>
              <div id="cart-meals-container" className="space-y-4">
                {cart.meals.map(({ slug }, idx) => {
                  const meal = bySlug[slug];
                  if (!meal) return null;
                  const entry = cart.meals[idx];
                  return (
                    <div key={`${slug}-${idx}`} className="bg-white rounded-2xl p-4 shadow-soft border border-cream-dark flex items-center justify-between gap-4">
                      <MealPhoto meal={meal} frameClass="w-16 h-16 rounded-xl overflow-hidden shrink-0" imgClass="w-full h-full object-cover" />
                      <div className="flex-1">
                        <h4 className="font-serif font-bold text-sm text-forest">{meal.name}</h4>
                        <span className="text-xs text-forest/70">
                          {entry.macros ? `${Math.round(entry.macros.kcal)} kcal • Protein: ${Math.round(entry.macros.protein_g)}g` : `${kcal(meal)} • Protein: ${protein(meal)}`}
                          {" • "}{entry.servings} {entry.servings === 1 ? "serving" : "servings"}
                        </span>
                        {entry.adjusted && <span className="ml-2 text-[10px] font-bold bg-lime-soft text-forest px-1.5 py-0.5 rounded">Adjusted</span>}
                      </div>
                      <button onClick={() => removeFromCart(idx, entry.slug)} className="text-forest/40 hover:text-red-600 p-2 text-sm">
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-8 space-y-6">
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-dark pb-4">
                  <div>
                    <h3 className="font-serif font-bold text-xl text-forest">Consolidated Shopping List</h3>
                    <p className="text-xs text-forest/70">Identical ingredients across all cart meals are automatically merged into single store packs.</p>
                  </div>
                  <div id="cart-list-actions" className="flex gap-2 print:hidden">
                    {[
                      ["Copy list", "fa-copy", listCopy],
                      ...(canShare ? [["Share", "fa-share-nodes", listShare]] : []),
                      ["Print", "fa-print", () => window.print()],
                    ].map(([text, icon, onClick]) => (
                      <button key={text} onClick={onClick} className="bg-cream-card hover:bg-lime text-forest font-bold px-3.5 py-2 rounded-xl text-xs transition-colors flex items-center gap-1.5">
                        <i className={`fa-solid ${icon} text-[10px]`}></i>
                        <span>{text}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {/* relative: the sr-only header label is absolute and would widen the page past this scroll box */}
                <div className="overflow-x-auto relative">
                  <table className={T.table}>
                    <thead className={T.head}>
                      <tr className="border-b border-cream-dark bg-cream/60 text-forest/70 uppercase text-[10px] font-bold">
                        <th className={T.th}>Ingredient</th>
                        <th className={T.th}>Product</th>
                        <th className={T.thNum}>Pack Size</th>
                        <th className={T.thNum}>Packs</th>
                        <th className={T.thNum}>Used</th>
                        <th className={T.thNum}>Bought</th>
                        <th className={T.thNum}>Leftover</th>
                        <th className={`${T.thNum} text-right`}>Price</th>
                        <th className={T.thNum}><span className="sr-only">Already have</span></th>
                      </tr>
                    </thead>
                    <tbody id="cart-consolidated-tbody" className={T.body}>
                      {cart.rows.filter((r) => !r.optional && !r.have).map((item) =>
                        item.packSize ? (
                          <tr key={item.key} className={T.row}>
                            <td className={T.ingredient}>{item.ingredient}</td>
                            <td className={T.product}><ProductCell row={item} onEdit={setEditing} /></td>
                            <td data-label="Pack" className={`${T.num} text-forest/70`}>{grams(item.packSize)}</td>
                            <td data-label="Packs" className={`${T.num} font-bold text-forest`}>{item.packs}</td>
                            <td data-label="Used" className={`${T.num} text-forest/70`}>{grams(item.needed)}</td>
                            <td data-label="Bought" className={`${T.num} text-forest/70`}>{grams(item.bought)}</td>
                            <td data-label="Leftover" className={T.num}>
                              <span className="font-bold text-forest">{grams(item.left)}</span>{" "}
                              {item.hasPrice ? <span className="text-[10px] text-forest/70">({money(item.leftCost)})</span> : null}
                            </td>
                            <td className={T.price}><CartPrice item={item} prices={prices} onBlocked={priceBlocked} /></td>
                            <td className={T.action}>
                              <button onClick={() => setHave(item.key, true, item.ingredient)} title="I already have this" aria-label={`I already have ${item.ingredient}`} className="text-forest/40 hover:text-red-600 p-1 text-sm">
                                <i className="fa-solid fa-trash-can"></i>
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={item.key} className={T.row}>
                            <td className={T.ingredient}>{item.ingredient}</td>
                            <td className={T.product}>no pack size yet</td>
                            <td data-label="Pack" className={`${T.num} text-forest/70`}></td>
                            <td data-label="Packs" className={`${T.num} font-bold text-forest`}></td>
                            <td data-label="Used" className={`${T.num} text-forest/70`}>{grams(item.needed)}</td>
                            <td data-label="Bought" className={`${T.num} text-forest/70`}></td>
                            <td data-label="Leftover" className={T.num}></td>
                            <td className={T.price}></td>
                            <td className={T.action}></td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Estimated prices count in the total, as on the recipe page */}
                {estRow && (
                  <p id="cart-estimates" className="text-xs text-forest/70">
                    Prices marked est. are estimates ({estimateLabel(estRow.pricePeriod, estRegion)}). Type your store&apos;s price to replace one.
                  </p>
                )}
                {/* Already at home: out of the total and leftovers; Restore buys it again */}
                {haveRows.length > 0 && (
                  <div id="cart-have" className="bg-cream/50 border border-cream-dark rounded-2xl p-4 space-y-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-forest/70">Already at home</h4>
                      <p className="text-[11px] text-forest/70">Not bought and not in the total. Restore one to buy it again.</p>
                    </div>
                    <div className="space-y-2">
                      {haveRows.map((item) => (
                        <div key={item.key} className="flex items-center gap-3 text-xs text-forest">
                          <span className="font-semibold w-36 shrink-0">{item.ingredient}</span>
                          <span className="flex-1 text-forest/70">{item.product || "Typical pack"}</span>
                          <span className="text-forest/70">{grams(item.needed)} needed</span>
                          <button onClick={() => setHave(item.key, false, item.ingredient)} className="font-bold underline hover:text-lime-hover">Restore</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Optional: spices, oil, sauces, bottled juice. Unticked = you have it; ticked ones are bought */}
                {optionalRows.length > 0 && (
                  <div id="cart-optional" className="bg-cream/50 border border-cream-dark rounded-2xl p-4 space-y-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-forest/70">Optional: you may already have these</h4>
                      <p className="text-[11px] text-forest/70">They last for weeks. Tick the ones you need to buy and they are added to the total.</p>
                    </div>
                    <div className="space-y-2">
                      {optionalRows.map((item) => (
                        <label key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-forest cursor-pointer">
                          <input type="checkbox" checked={!!item.included} onChange={(e) => setOptional(item.key, e.target.checked)} className="w-4 h-4 accent-forest" />
                          <span className="font-semibold sm:w-36 shrink-0">{item.ingredient}</span>
                          {/* On phones the product, then pack size and price, wrap to their own lines */}
                          <span className="flex-1 min-w-[9rem]">{item.product || "Typical pack"}</span>
                          <span className="ml-auto flex items-center gap-3">
                            <span className="text-forest/70">{item.packs > 1 ? `${item.packs} x ` : ""}{grams(item.packSize)}</span>
                            <CartPrice item={item} prices={prices} onBlocked={priceBlocked} priceClass="font-bold w-14 text-right" />
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div className="bg-forest text-cream p-6 rounded-2xl space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-cream/70">
                      {cart.totals.unpriced && cart.totals.priced
                        ? `Partial total (${cart.totals.unpriced} ${cart.totals.unpriced === 1 ? "item has" : "items have"} no price yet):`
                        : "Cost of purchase:"}
                    </span>
                    <span id="cart-total-bought" className="font-bold text-lime text-sm">{cart.totals.priced ? money(cart.totals.bought) : "No prices yet"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-cream/70">Cost of what you use:</span>
                    <span id="cart-total-used" className="font-bold text-white">{cart.totals.priced ? money(cart.totals.used) : "No prices yet"}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-cream/10 pt-2">
                    <span className="text-cream/70">Total waste/leftover:</span>
                    <span id="cart-total-waste" className="font-bold text-amber-300">{grams(cart.totals.wasteGrams)}{cart.totals.priced ? ` (${money(cart.totals.wasteCost)})` : ""}</span>
                  </div>
                </div>
              </div>

              {/* Leftovers: live from the cart meals; deleting a meal from the cart removes them */}
              {cart.leftovers.length > 0 && (
                <div id="cart-leftovers" className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-5">
                  <div className="border-b border-cream-dark pb-4">
                    <h3 className="font-serif font-bold text-xl text-forest">Your Leftovers</h3>
                    <p className="text-xs text-forest/70">What the meals in your cart leave over. Use them in another meal and the packs above cover it, so you buy less.</p>
                    {!adjust && (
                      <button onClick={openAdjust} className="mt-3 bg-forest hover:bg-forest-light text-lime font-bold text-xs px-5 py-2.5 rounded-full transition-all inline-flex items-center gap-2">
                        <i className="fa-solid fa-scale-balanced"></i><span>Adjust leftovers to meals</span>
                      </button>
                    )}
                  </div>
                  {adjust && (
                    <div id="adjust-panel" className="bg-cream/50 border border-cream-dark rounded-2xl p-4 space-y-3">
                      {adjust.suggestions.length === 0 ? (
                        <p className="text-xs text-forest/70">Nothing to improve: with small gram changes (up to 15%) and servings, these leftovers are already as low as they go.</p>
                      ) : (
                        <>
                          <p className="text-xs text-forest/70">Small changes for this cart only; your saved recipes stay the same. Protein stays at 90% of your target or more.</p>
                          {adjust.suggestions.map((sg) => (
                            <label key={sg.id} className="flex items-start gap-3 text-xs text-forest cursor-pointer">
                              <input type="checkbox" checked={adjust.picked.includes(sg.id)} onChange={() => togglePick(sg.id)} className="w-4 h-4 mt-0.5 accent-forest" />
                              {sg.kind === "servings" ? (
                                <span><span className="font-bold">{sg.meal}</span>: {sg.from} → {sg.to} servings</span>
                              ) : sg.kind === "fit" ? (
                                <span><span className="font-bold">{sg.meal}</span>: {sg.from} → {sg.to} servings, {sg.ingredient} {sg.gramsFrom} → {sg.gramsTo} g per serving ({sg.packs} {sg.packs === 1 ? "pack" : "packs"} in total, protein stays on target)</span>
                              ) : (
                                <span><span className="font-bold">{sg.ingredient}</span>:{" "}
                                  {sg.changes.map((c, i) => (
                                    <span key={i}>{i ? "; " : ""}{c.meal} {c.from} → {c.to} g per serving ({pct(c.own, c.to)})</span>
                                  ))}
                                </span>
                              )}
                            </label>
                          ))}
                          <p className="text-xs text-forest">
                            Leftovers <span className="font-bold">{leftValue(adjust.before)} → {leftValue(adjust.after)}</span>
                            {adjust.before.priced ? <>{" · "}Cart <span className="font-bold">{money(adjust.before.bought)} → {money(adjust.after.bought)}</span></> : null}
                          </p>
                        </>
                      )}
                      <div className="flex gap-2">
                        {adjust.suggestions.length > 0 && (
                          <button onClick={() => { applyAdjust(adjust.picked); setAdjust(null); }} disabled={!adjust.picked.length} className="bg-lime hover:bg-lime-hover disabled:opacity-50 text-forest font-bold text-xs px-5 py-2 rounded-full transition-all">Apply</button>
                        )}
                        <button onClick={() => setAdjust(null)} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2">{adjust.suggestions.length ? "Cancel" : "Close"}</button>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {cart.leftovers.map((l) => (
                      <span key={l.key} className="inline-flex items-center gap-1.5 bg-cream-dark text-forest text-xs px-3 py-1 rounded-full font-medium">
                        <span className="font-bold">{l.ingredient}</span> {grams(l.left)}
                        <span className="text-[10px] text-forest/70">({l.leftCost != null ? `${money(l.leftCost)}, ` : ""}{l.status})</span>
                      </span>
                    ))}
                  </div>
                  {cart.leftoverRecipes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-forest/70">Recipes that use them</h4>
                      {cart.leftoverRecipes.map((r) => (
                        <Link key={r.slug} href={`/recipes/${r.slug}`} className="flex items-center justify-between gap-4 bg-cream/50 border border-cream-dark rounded-2xl px-4 py-3 hover:border-forest transition-colors">
                          <span className="font-serif font-bold text-sm text-forest">{r.name}</span>
                          <span className="text-xs text-forest/70 text-right">uses {r.uses.join(", ")}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* TAB 5: HOW IT WORKS */}
        <section id="tab-how-it-works" className={`tab-page space-y-10 max-w-[1360px] mx-auto px-8${tab === "how-it-works" ? "" : " hidden"}`}>
          <div className="text-center max-w-xl mx-auto space-y-2">
            <span className="font-script text-3xl text-forest font-bold">From craving to cart</span>
            <h1 className="font-serif text-4xl font-bold text-forest">How SmartBite Works</h1>
            <p className="text-xs text-forest/70">AI picks the foods and grams; code does all the math. Bring your own AI key, or try the demo without one.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {[
              ["Tell us your craving", "Say what you want to eat, foods to leave out, your targets and your budget."],
              ["Pick 1 of 4 ideas", "Pick one of four AI meal ideas made for your targets."],
              ["Whole packs", "Each ingredient gets a typical pack size, so you see what you buy and what is left over."],
              ["Real macros", "Calories and macros are worked out in code for what you eat, not for the leftovers."],
              ["One cart", "Add meals to one cart that merges the same foods, so you buy each food once."],
            ].map(([title, text], i) => (
              <div key={title} className="bg-white rounded-3xl p-6 shadow-soft border border-cream-dark space-y-3 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-2xl bg-forest text-lime font-bold flex items-center justify-center text-lg">{i + 1}</div>
                <h3 className="font-serif font-bold text-base text-forest">{title}</h3>
                <p className="text-xs text-forest/70">{text}</p>
              </div>
            ))}
          </div>
          <div className="bg-cream-card rounded-3xl p-8 border border-cream-dark max-w-3xl mx-auto flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-lime text-forest flex items-center justify-center shrink-0 font-bold text-lg">
              <i className="fa-solid fa-leaf"></i>
            </div>
            <div className="space-y-1">
              <h4 className="font-serif font-bold text-lg text-forest">Leftovers you can use</h4>
              <p className="text-xs text-forest/80 leading-relaxed">
                We try to keep leftovers low, because stores sell fixed packs and fruit and vegetables often come per kg. Each leftover is marked: it keeps, or use it within 2 days.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <Footer onNavigate={switchTab} />

      {editing && <ProductDialog row={editing} onClose={() => setEditing(null)} showToast={showToast} />}

      {/* Toast Feedback Overlay */}
      <Toast toast={toast} />
    </div>
  );
}

// "..." menu on a My Recipes card for a meal made in this browser (decided 2026-11-09): Edit opens the recipe page with
// the editor; Delete asks once more, then removes the meal, its photo and its cart entries for good.
function CardMenu({ meal, showToast }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (!box.current?.contains(e.target)) { setOpen(false); setConfirm(false); } };
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); setConfirm(false); } };
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", away); window.removeEventListener("keydown", onKey); };
  }, [open]);
  const remove = async () => {
    if (!confirm) return setConfirm(true);
    if (!deleteLocalMeal(meal.slug)) return showToast("Not deleted. Try again.");
    await deletePhoto(meal.slug);
    setOpen(false);
    showToast(`Deleted "${meal.name}".`);
  };
  const item = "w-full text-left px-4 py-2.5 text-xs font-bold flex items-center gap-2.5 hover:bg-cream-card";
  return (
    <div ref={box} className="absolute top-3 right-3 z-20">
      <button type="button" aria-label={`Options for ${meal.name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(!open); setConfirm(false); }}
        className="w-8 h-8 rounded-full bg-white/90 hover:bg-white shadow-soft text-forest flex items-center justify-center">
        <i className="fa-solid fa-ellipsis"></i>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-card border border-cream-dark overflow-hidden">
          <button role="menuitem" onClick={() => router.push(`/recipes/${meal.slug}?edit=1`)} className={`${item} text-forest`}>
            <i className="fa-regular fa-pen-to-square w-4"></i>Edit meal
          </button>
          <button role="menuitem" onClick={remove} className={`${item} text-red-700`}>
            <i className="fa-regular fa-trash-can w-4"></i>{confirm ? "Tap again to delete" : "Delete meal"}
          </button>
        </div>
      )}
    </div>
  );
}

// Make Your Meal. With the user's own key (Profile) the ideas and the recipe come from lib/llm.js and the engine
// (lib/engine.js) computes packs and macros; the finished meal is kept in this browser and opens as its recipe page.
// Until the profile is complete the real app sends Make Your Meal to /start (Use my API key or Try the demo). The demo
// (/demo) never calls a model: the ideas are the demo meals and picking one opens its recipe page.
const toList = (v) => (Array.isArray(v) ? v.map(String) : []);
// URL slug for a meal made here: the title plus a time stamp, so two meals never share one
const mealSlug = (title) => `${String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "meal"}-${Date.now().toString(36)}`;
const hasGear = (gear, name) => gear.some((g) => g.toLowerCase().trim() === name);

// Step 1 quiz options (decided 2026-11-09, ported from the personal app): [value sent, label, Font Awesome icon, small
// line]. Labels carry soft hyphens (\u00ad) and a zero-width space (\u200b) where a long word may break on a narrow
// phone; both stay invisible when the word fits. Craving values are the words the craving sentence uses; avoid values are plain English food names, matched
// against dishes by lib/inspiration.js (every word of the item in one food name).
const QUIZ = {
  protein: [["chicken", "Chicken", "fa-drumstick-bite"], ["turkey", "Turkey", "fa-feather"], ["beef", "Beef", "fa-cow"],
    ["salmon or white fish", "Fish", "fa-fish"], ["canned tuna", "Canned tuna", "fa-fish-fins"], ["eggs", "Eggs", "fa-egg"],
    ["chickpeas or lentils", "Leg\u00adumes", "fa-jar"], ["tofu", "Tofu", "fa-cubes"]],
  style: [["bowl", "Bowl", "fa-bowl-rice"], ["salad", "Salad", "fa-leaf"], ["stew or soup", "Stew or soup", "fa-mug-hot"],
    ["stir-fry", "Stir-fry", "fa-fire-burner"], ["baked in the oven", "Oven bake", "fa-temperature-high"],
    ["air fried", "Air fried", "fa-wind"], ["lunch or dinner", "Lunch/\u200bDinner", "fa-utensils"], ["breakfast", "Break\u00adfast", "fa-bread-slice"]],
  cuisine: [["Spanish", "Spanish", "fa-sun"], ["Mediterranean", "Medi\u00adter\u00adranean", "fa-umbrella-beach"],
    ["Italian", "Italian", "fa-pizza-slice"], ["Greek", "Greek", "fa-landmark"], ["Mexican", "Mexican", "fa-pepper-hot"],
    ["Asian (Chinese, Japanese, Korean or Thai)", "Asian", "fa-torii-gate"], ["Indian", "Indian", "fa-gopuram"],
    ["Middle Eastern", "Middle Eastern", "fa-mosque"]],
  avoid: [["onion", "Onion"], ["garlic", "Garlic"], ["bell pepper", "Bell pepper"], ["tomato", "Tomato"], ["mushrooms", "Mushrooms"],
    ["avocado", "Avocado"], ["cilantro", "Cilantro"], ["spicy food", "Spicy food"], ["pork", "Pork"], ["fish", "Fish"],
    ["eggs", "Eggs"], ["dairy", "Dairy"]],
  time: [["15", "Under 15 min", "fa-bolt", "Quick, few steps"], ["30", "Under 30 min", "fa-clock", "Normal weeknight"],
    ["45", "Under 45 min", "fa-hourglass-half", "Time for the oven"]],
  gear: [["microwave", "Microwave", "fa-tv"], ["stove", "Stove", "fa-fire-burner"], ["oven", "Oven", "fa-temperature-high"],
    ["airFryer", "Air fryer", "fa-wind"], ["blender", "Blender", "fa-blender"]],
};
const quizLabel = (list, v) => (list.find((o) => o[0] === v) || [v, v])[1];
const flip = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

// Option card on a native checkbox or radio (selected state shown by fill and tick, not by colour alone)
function Choice({ type = "checkbox", name, checked, onChange, icon, label, sub, tall, tile }) {
  const box = tile ? "justify-center p-0 min-h-[48px]" : tall ? "flex-col items-start p-4 min-h-[118px]" : "items-center p-3 min-h-[52px]";
  return (
    <label className={`quiz-opt relative flex ${box} gap-2.5 border-[1.5px] border-cream-dark rounded-2xl bg-cream/50 cursor-pointer select-none text-forest hover:border-forest-light transition-colors active:scale-[.98]`}>
      <input type={type} name={name} checked={checked} onChange={onChange} className="sr-only" />
      {icon && (
        <span className={`quiz-ico ${tall ? "w-11 h-11 text-lg" : "w-9 h-9 text-sm"} rounded-xl bg-white flex items-center justify-center shrink-0`}>
          <i className={`fa-solid ${icon}`}></i>
        </span>
      )}
      <span className="min-w-0 grid gap-0.5">
        <span className={`font-bold ${tile ? "text-base font-extrabold" : tall ? "text-[15px]" : "text-[13px]"}`}>{label}</span>
        {sub && <span className="quiz-sub text-[11.5px] text-forest/70 font-medium">{sub}</span>}
      </span>
      {!tile && (
        <span className={`quiz-tick ${tall ? "absolute top-3.5 right-3.5 flex" : "ml-auto hidden sm:flex"} w-5 h-5 rounded-full border-[1.5px] border-cream-dark bg-white items-center justify-center shrink-0`}>
          <i className="fa-solid fa-check text-[10px]"></i>
        </span>
      )}
    </label>
  );
}

const Chip = ({ on, onClick, children }) => (
  <button type="button" aria-pressed={on} onClick={onClick}
    className={`text-xs font-bold px-3.5 py-1.5 rounded-full border-[1.5px] transition-colors ${on ? "bg-forest border-forest text-cream" : "bg-white border-cream-dark text-forest hover:border-forest-light"}`}>
    {children}
  </button>
);

// Slider with the number beside it: drag, tap a preset, or type (sliders need a typed fallback)
function Dial({ id, label, icon, unit, min, max, step, value, onChange, presets = [], note, money: isMoney, children }) {
  const [draft, setDraft] = useState(null);
  const show = (v) => (isMoney ? v.toFixed(2) : String(v));
  const clamp = (v) => Math.min(max, Math.max(min, isMoney ? Math.round(v * 2) / 2 : Math.round(v)));
  const typed = (raw) => {
    setDraft(raw);
    const v = parseFloat(raw.replace(",", "."));
    if (v >= min && v <= max) onChange(clamp(v));
  };
  const done = () => {
    const v = parseFloat((draft ?? "").replace(",", "."));
    if (!Number.isNaN(v)) onChange(clamp(v));
    setDraft(null);
  };
  return (
    <div className="bg-cream/50 border-[1.5px] border-cream-dark rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label htmlFor={id} className="flex items-center gap-2.5 text-sm font-bold text-forest">
          <span className="w-9 h-9 rounded-xl bg-white flex items-center justify-center"><i className={`fa-solid ${icon}`}></i></span>
          {label}
        </label>
        {value !== null && (
          <span className="flex items-baseline gap-1">
            <input id={id} inputMode="decimal" value={draft ?? show(value)} onChange={(e) => typed(e.target.value)} onBlur={done}
              className="w-[4.5ch] bg-transparent border-b-2 border-dashed border-cream-dark focus:border-lime-hover focus:outline-none text-right font-serif text-3xl font-extrabold text-forest tabular-nums" />
            <span className="text-sm font-bold text-forest/70">{unit}</span>
          </span>
        )}
      </div>
      {children}
      {value !== null && (
        <>
          <input type="range" id={`${id}-range`} min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))}
            onChange={(e) => onChange(Number(e.target.value))} aria-label={label} aria-valuetext={`${show(value)} ${unit}`} className="quiz-range"
            style={{ "--p": `${((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100}%` }} />
          <div className="flex justify-between text-[11px] font-semibold text-forest/70 -mt-1 tabular-nums">
            <span>{show(min)} {unit}</span><span>{show(max)} {unit}</span>
          </div>
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => <Chip key={p} on={value === p} onClick={() => onChange(p)}>{show(p)} {unit}</Chip>)}
            </div>
          )}
        </>
      )}
      {note && <p className="text-xs text-forest/70">{note}</p>}
    </div>
  );
}

// Step 1: one question per screen, then a check-your-answers summary (decided 2026-11-09). Each visit starts from the
// user's profile (targets, gear, foods to avoid, budget); answers are not remembered between visits.
function MakeMealStep1({ hidden, showToast, leftovers, demoMeals, demo, complete }) {
  const [crave, setCrave] = useState({ protein: [], style: [], cuisine: [] });
  const [craveText, setCraveText] = useState("");
  // Leftovers in the cart: a tap adds one to the craving, so the ideas build on it
  const [useLeftovers, setUseLeftovers] = useState([]);
  const [avoid, setAvoid] = useState([]);
  const [kcalTarget, setKcalTarget] = useState(450);
  const [proteinTarget, setProteinTarget] = useState(45);
  const [profileTargets, setProfileTargets] = useState({ kcal: null, protein: null });
  const [carbsMax, setCarbsMax] = useState(null); // null = no limit
  const [fatMax, setFatMax] = useState(null);
  const [time, setTime] = useState("30");
  const [gear, setGear] = useState({ microwave: true, stove: true, oven: true, airFryer: false, noBlender: true });
  const [reheat, setReheat] = useState(true);
  const [lowLeftovers, setLowLeftovers] = useState(true);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [servings, setServings] = useState(1);
  const [budget, setBudget] = useState(5.5);
  // The profile lives in this browser, so it is read after the first render (and again after Create profile)
  const loadDefaults = () => {
    const profile = readProfile();
    const kcal = Number(fieldValue(profile, "kcal_target")) || null;
    const protein = Number(fieldValue(profile, "protein_g_target")) || null;
    if (kcal) setKcalTarget(Math.round(kcal));
    if (protein) setProteinTarget(Math.round(protein));
    setProfileTargets({ kcal, protein });
    const g = toList(fieldValue(profile, "gear", []));
    if (g.length) setGear({ microwave: hasGear(g, "microwave"), stove: hasGear(g, "stove"), oven: hasGear(g, "oven"),
      airFryer: hasGear(g, "air fryer"), noBlender: hasGear(g, "no blender") });
    // Profile foods to avoid: the ones that are cards start ticked, the rest are typed items
    const excluded = toList(fieldValue(profile, "exclude", []));
    const cards = QUIZ.avoid.map(([v]) => v);
    setAvoid(excluded.map((x) => x.toLowerCase().trim()).filter((x) => cards.includes(x)));
    setTags(excluded.filter((x) => !cards.includes(x.toLowerCase().trim())));
    const b = readBudget();
    if (b !== DEFAULT_BUDGET) setBudget(Math.round(b * servings * 2) / 2);
  };
  useEffect(() => {
    loadDefaults();
    // The form is mounted while hidden: Create profile from the menu must reach it too
    window.addEventListener(SETUP_DONE_EVENT, loadDefaults);
    return () => window.removeEventListener(SETUP_DONE_EVENT, loadDefaults);
    // loadDefaults reads only storage and the servings at the time
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const addTag = () => {
    const val = tagInput.trim();
    if (!val) return;
    setTags([...tags, val]);
    setTagInput("");
  };
  const perServing = budget / servings;
  const exclude = [...avoid, ...tags];
  const craving = [...crave.protein, ...crave.style, ...crave.cuisine, craveText.trim(),
    ...leftovers.filter((l) => useLeftovers.includes(l.key)).map((l) => `use my leftover ${l.ingredient} (${grams(l.left)})`)]
    .filter(Boolean).join(", ");
  const [q, setQ] = useState(0);
  const [toSummary, setToSummary] = useState(false);
  const [quizError, setQuizError] = useState("");
  const quizTop = useRef(null);
  const quizTitle = useRef(null);
  const moved = useRef(false);
  const router = useRouter();
  // { step: 1 } | { step: 2, loading } | { step: 2, ideas, demo } | { step: 2 or 3, error } | { step: 3, loading }
  // Step 3 also keeps { idea, recipe } once the recipe is written, so "Try again" re-runs only the engine
  const [run, setRun] = useState({ step: 1 });
  const [preview, setPreview] = useState(null); // idea shown in the preview card before picking
  const [changes, setChanges] = useState("");
  useEffect(() => {
    if (!preview) return;
    const onKey = (e) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);
  const step = run.step;
  const demoIdeas = () => demoPicks(demoMeals.filter((m) => m.idea), craving, exclude)
    .map((m, i) => ({ ...m.idea, ...demoIdea(m), idea_id: String(i + 1), slug: m.slug }));
  const showDemo = () => { setPreview(null); setRun({ step: 2, demo: true, ideas: demoIdeas() }); };
  const startOver = () => { setPreview(null); setRun({ step: 1 }); };
  const indicator = (n) => (step >= n
    ? ["flex items-center gap-2 font-bold text-xs text-forest", "w-7 h-7 rounded-full bg-lime text-forest flex items-center justify-center font-extrabold text-xs"]
    : ["flex items-center gap-2 font-semibold text-xs text-forest/70", "w-7 h-7 rounded-full bg-cream-dark text-forest/70 flex items-center justify-center text-xs"]);
  const toggleGear = (key) => setGear({ ...gear, [key]: !gear[key] });
  const hasGearOn = (k) => (k === "blender" ? !gear.noBlender : gear[k]);
  const toggleGearCard = (k) => toggleGear(k === "blender" ? "noBlender" : k);

  const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
  const QUESTIONS = [
    { title: "What are you craving?", icon: "fa-utensils",
      hint: "Tap anything that sounds good. Mix as many as you like, or add your own words.",
      summary: craving || "Not chosen yet",
      check: () => (craving ? "" : "Tap at least one thing, or type a few words."),
      body: (
        <>
          {[["protein", "Protein"], ["style", "Kind of meal"], ["cuisine", "Flavour"]].map(([key, legend]) => (
            <fieldset key={key} className="space-y-2.5">
              <legend className="text-xs font-bold uppercase tracking-wider text-forest/70 mb-2.5">{legend}</legend>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {QUIZ[key].map(([v, label, icon]) => (
                  <Choice key={v} checked={crave[key].includes(v)} onChange={() => setCrave({ ...crave, [key]: flip(crave[key], v) })} icon={icon} label={label} />
                ))}
              </div>
            </fieldset>
          ))}
          {leftovers.length > 0 && (
            <div id="craving-leftovers" className="bg-cream/50 border border-cream-dark rounded-2xl p-3 space-y-2">
              <p className="text-xs text-forest/70"><span className="font-bold">Leftovers in your cart.</span> Tap one to cook with it.</p>
              <div className="flex flex-wrap gap-2">
                {leftovers.map((l) => (
                  <Chip key={l.key} on={useLeftovers.includes(l.key)} onClick={() => setUseLeftovers(flip(useLeftovers, l.key))}>
                    <i className="fa-solid fa-plus text-[10px] mr-1"></i>{l.ingredient} {grams(l.left)}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <div>
            <label htmlFor="input-craving" className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">Your own words (optional)</label>
            <input type="text" id="input-craving" value={craveText} onChange={(e) => setCraveText(e.target.value)} placeholder="e.g. something with a crunchy topping" className="w-full bg-cream/50 border border-cream-dark rounded-2xl px-4 py-3 text-sm text-forest placeholder-forest/40 focus:outline-none focus:border-forest" />
          </div>
          <div className="bg-lime-soft rounded-2xl px-4 py-3 text-sm text-forest flex gap-2.5 items-start">
            <i className="fa-solid fa-comment mt-0.5"></i>
            <span>{craving ? <>We will ask for: <span className="font-bold">{craving}</span></> : "Your craving shows here as you tap."}</span>
          </div>
        </>
      ) },
    { title: "Anything you do NOT want?", icon: "fa-ban",
      hint: "Tap the foods to leave out. Skip this if nothing bothers you.",
      summary: [...avoid.map((v) => quizLabel(QUIZ.avoid, v)), ...tags].join(", ") || "Nothing",
      body: (
        <>
          <fieldset>
            <legend className="sr-only">Foods to leave out</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {QUIZ.avoid.map(([v, label]) => <Choice key={v} checked={avoid.includes(v)} onChange={() => setAvoid(flip(avoid, v))} label={label} />)}
            </div>
          </fieldset>
          <div>
            <label htmlFor="unwanted-input" className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">Something else</label>
            <div className="flex items-center gap-2 mb-3">
              <input type="text" id="unwanted-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); addTag(); } }}
                placeholder="Type a food and press Add (e.g. olive oil)" className="flex-1 min-w-0 bg-cream/50 border border-cream-dark rounded-xl px-4 py-2.5 text-xs text-forest focus:outline-none focus:border-forest" />
              <button type="button" onClick={addTag} className="bg-forest text-cream font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-forest-light">Add</button>
            </div>
            <div id="unwanted-tags-container" className="flex flex-wrap gap-2">
              {tags.map((t, i) => (
                <span key={`${t}-${i}`} className="tag-item inline-flex items-center gap-1.5 bg-cream-dark text-forest text-xs px-3 py-1 rounded-full font-medium">
                  {t}
                  <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} aria-label={`Remove ${t}`} className="hover:text-red-600"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                </span>
              ))}
            </div>
          </div>
        </>
      ) },
    { title: "How big should it be?", icon: "fa-dumbbell",
      hint: "Per serving. Drag the bar, tap a preset, or type the exact number.",
      summary: `${kcalTarget} kcal, ${proteinTarget} g protein`,
      check: () => (proteinTarget * 4 > kcalTarget ? "Protein alone is more calories than the target. Lower protein or raise calories." : ""),
      body: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Dial id="input-calories" label="Calories" icon="fa-fire" unit="kcal" min={200} max={1200} step={10} value={kcalTarget} onChange={setKcalTarget}
            presets={[350, 450, 550, 650]} note={profileTargets.kcal ? `Your profile target: ${profileTargets.kcal} kcal.` : null} />
          <Dial id="input-protein" label="Protein" icon="fa-dumbbell" unit="g" min={10} max={120} step={1} value={proteinTarget} onChange={setProteinTarget}
            presets={[30, 40, 45, 55]} note={`About ${Math.round((proteinTarget * 4 * 100) / kcalTarget)}% of the calories come from protein.`} />
        </div>
      ) },
    { title: "Any limits on carbs or fat?", icon: "fa-sliders",
      hint: "Optional. Most meals need no limit here.",
      summary: `${carbsMax === null ? "carbs no limit" : `carbs max ${carbsMax} g`}, ${fatMax === null ? "fat no limit" : `fat max ${fatMax} g`}`,
      body: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[["input-carbs", "Max carbs", "fa-wheat-awn", carbsMax, setCarbsMax, 10, 150, 5, 50, [30, 50, 70]],
            ["input-fat", "Max fat", "fa-droplet", fatMax, setFatMax, 5, 60, 1, 20, [15, 20, 25]]].map(([id, label, icon, value, set, min, max, step, start, presets]) => (
            <Dial key={id} id={id} label={label} icon={icon} unit="g" min={min} max={max} step={step} value={value} onChange={set} presets={presets}
              note={value === null ? "No limit." : null}>
              <div className="flex gap-1.5">
                <Chip on={value === null} onClick={() => set(null)}>No limit</Chip>
                <Chip on={value !== null} onClick={() => value === null && set(start)}>Set a max</Chip>
              </div>
            </Dial>
          ))}
        </div>
      ) },
    { title: "How many servings, and what budget?", icon: "fa-cart-shopping",
      hint: "Servings for the batch you cook at once.",
      summary: `${plural(servings, "serving")}, ${money(budget)} total`,
      body: (
        <>
          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wider text-forest/70 mb-2.5">Servings</legend>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <Choice key={n} type="radio" name="servings" checked={servings === n} onChange={() => setServings(n)} label={n} tile />
              ))}
            </div>
          </fieldset>
          <Dial id="input-budget" label="Total budget" icon="fa-wallet" unit={moneySymbol()} min={2} max={60} step={0.5} value={budget} onChange={setBudget} money
            presets={[4, 5.5, 8, 12]} note={<span id="budget-per-serving"><span className="font-bold">{money(perServing)}</span> per serving for {plural(servings, "serving")}.</span>} />
        </>
      ) },
    { title: "How much time to cook?", icon: "fa-clock",
      hint: "Hands-on time for one batch.",
      summary: quizLabel(QUIZ.time, time),
      body: (
        <fieldset>
          <legend className="sr-only">Time limit</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {QUIZ.time.map(([v, label, icon, sub]) => <Choice key={v} type="radio" name="time" checked={time === v} onChange={() => setTime(v)} icon={icon} label={label} sub={sub} tall />)}
          </div>
        </fieldset>
      ) },
    { title: "What can you cook with?", icon: "fa-kitchen-set",
      hint: "Untick anything you do not have this week.",
      summary: QUIZ.gear.filter(([k]) => hasGearOn(k)).map(([, label]) => label).join(", ") || "Nothing ticked",
      body: (
        <fieldset>
          <legend className="sr-only">Kitchen gear</legend>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {QUIZ.gear.map(([k, label, icon]) => <Choice key={k} checked={hasGearOn(k)} onChange={() => toggleGearCard(k)} icon={icon} label={label} tall />)}
          </div>
        </fieldset>
      ) },
    { title: "Two last things", icon: "fa-list-check",
      hint: "Both are on by default.",
      summary: [reheat && "I can reheat at work", lowLeftovers && "Keep leftovers low"].filter(Boolean).join(", ") || "Neither",
      body: (
        <fieldset>
          <legend className="sr-only">Extras</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Choice checked={reheat} onChange={() => setReheat(!reheat)} icon="fa-briefcase" label="I can reheat at work" sub="Meals that keep and reheat in a microwave" tall />
            <Choice checked={lowLeftovers} onChange={() => setLowLeftovers(!lowLeftovers)} icon="fa-recycle" label="Keep leftovers low" sub="Stores sell fixed pack sizes, so we try to buy only what you will use" tall />
          </div>
        </fieldset>
      ) },
  ];
  const review = q === QUESTIONS.length;
  const goTo = (n, fromSummary = false) => { moved.current = true; setQuizError(""); setToSummary(fromSummary); setQ(n); };
  // after a move: focus the new question title and bring the card's top into view
  useEffect(() => {
    if (!moved.current) return;
    quizTitle.current?.focus({ preventScroll: true });
    if (quizTop.current && quizTop.current.getBoundingClientRect().top < 0) quizTop.current.scrollIntoView({ block: "start" });
  }, [q]);
  const next = () => {
    if (review) return saveRequest();
    const problem = QUESTIONS[q].check?.();
    if (problem) return setQuizError(problem);
    goTo(toSummary ? QUESTIONS.length : q + 1);
  };
  const onQuizKey = (e) => {
    if (e.key !== "Enter" || e.target.closest("button")) return;
    e.preventDefault();
    next();
  };

  const saveRequest = async () => {
    if (!craving.trim()) return showToast("Tell us what you are craving first.");
    const { form, errors } = checkForm({
      craving, exclude, kcal_target: kcalTarget, protein_g_target: proteinTarget,
      carbs_g_max: carbsMax ?? "", fat_g_max: fatMax ?? "", budget_total_eur: budget, servings, time_limit_min: time,
      // form gear: oven, air_fryer, no_blender, and microwave_only when the microwave is the only heat source
      gear: [gear.oven && "oven", gear.airFryer && "air_fryer", gear.noBlender && "no_blender",
             gear.microwave && !gear.stove && !gear.oven && !gear.airFryer && "microwave_only"].filter(Boolean),
      reheat_at_work: reheat, keep_leftovers_low: lowLeftovers,
    });
    if (errors.length) return showToast(`Not sent: ${errors.join(", ")}.`);
    if (demo) return showDemo();
    const llm = readLlm();
    setRun({ step: 2, loading: true, form });
    try {
      const out = await generateIdeas({ form, profile: readProfile(), llm });
      setRun({ step: 2, form, ideas: out.ideas });
    } catch (e) {
      setRun({ step: 2, form, error: e.message });
    }
  };
  // Recipe -> engine (packs and macros) -> up to 2 reruns on macro misses or high leftovers (lib/flow.js), with a
  // short progress line. If the engine fails, the written recipe stays in this run for "Try again".
  const [progress, setProgress] = useState(null);
  const notReady = (recipe, message) =>
    `Your recipe "${recipe.title}" is written, but packs and macros are not ready: ${message} The recipe is kept, so you can try again.`;
  const finish = async (base, idea, given = null) => {
    let out;
    try {
      out = await makeMeal({ idea, form: base.form, profile: readProfile(), llm: readLlm(), recipe: given,
        products: readActiveProducts(), ...engineEstimates(), onProgress: setProgress });
    } catch (e) {
      setProgress(null);
      const recipe = e.recipe || given;
      return setRun(recipe ? { ...base, step: 3, loading: false, idea, recipe, error: notReady(recipe, e.message) }
        : { ...base, step: 3, loading: false, error: e.message });
    }
    setProgress(null);
    const { meal: doc, recipe } = out;
    try {
      const slug = mealSlug(recipe.title);
      const shown = toMeal(slug, doc, { kind: "local" }); // throws if the page could not show it
      if (!saveLocalMeal(slug, doc)) {
        return setRun({ ...base, step: 3, loading: false, idea, recipe, error: "Not saved: this browser blocks storage." });
      }
      // A key that can make images (Gemini, OpenAI, OpenRouter) makes the photo right away (decided 2026-11-09);
      // other keys keep the manual photo card
      const llm = readLlm();
      if (photoMaker(llm) && shown.photoPrompt) makePhoto(slug, shown.photoPrompt, llm);
      router.push(`/recipes/${slug}`);
    } catch (e) {
      setRun({ ...base, step: 3, loading: false, idea, recipe, error: notReady(recipe, e.message) });
    }
  };
  const pick = async (idea) => {
    setPreview(null);
    if (run.demo) return router.push(`/recipes/${idea.slug}`);
    const base = { ...run, recipe: null, idea: null, error: null };
    setRun({ ...base, step: 3, loading: true });
    await finish(base, idea);
  };
  const retryEngine = async () => {
    const { idea, recipe } = run;
    const base = { ...run, recipe: null, idea: null, error: null };
    setRun({ ...base, step: 3, loading: true, idea, recipe });
    await finish(base, idea, recipe);
  };
  const [revising, setRevising] = useState(false);
  const revise = async (idea) => {
    if (revising) return;
    setPreview(null);
    setRevising(true);
    showToast("Updating the idea...");
    try {
      const updated = await reviseIdea({ idea, changes, form: run.form, profile: readProfile(), llm: readLlm() });
      setRun({ ...run, ideas: run.ideas.map((i) => (i.idea_id === idea.idea_id ? updated : i)) });
      setChanges("");
      setPreview(updated);
    } catch (e) {
      showToast(`Not changed: ${e.message}`);
    } finally {
      setRevising(false);
    }
  };

  return (
    <section id="tab-make-meal" className={`tab-page space-y-8 max-w-[1360px] mx-auto px-8${hidden ? " hidden" : ""}`}>
      <div className="bg-white rounded-3xl p-4 shadow-soft border border-cream-dark flex items-center justify-around max-w-3xl mx-auto">
        <div id="step-indicator-1" className={indicator(1)[0]}>
          <span className={indicator(1)[1]}>1</span>
          <span>Your craving</span>
        </div>
        <div className="w-12 h-0.5 bg-cream-dark"></div>
        <div id="step-indicator-2" className={indicator(2)[0]}>
          <span className={indicator(2)[1]}>2</span>
          <span>Pick an idea</span>
        </div>
        <div className="w-12 h-0.5 bg-cream-dark"></div>
        <div id="step-indicator-3" className={indicator(3)[0]}>
          <span className={indicator(3)[1]}>3</span>
          <span>Your meal</span>
        </div>
      </div>

      <div id="make-step-1" ref={quizTop} onKeyDown={onQuizKey} className={`bg-white rounded-3xl p-6 sm:p-10 shadow-soft border border-cream-dark max-w-4xl mx-auto space-y-6 scroll-mt-6${step !== 1 ? " hidden" : ""}`}>
        {/* Real app: the quiz waits for a complete profile (hidden, not unmounted, while the profile is read; once read
            as not complete, the page goes to /start). The demo says what it is and leads to /start. */}
        {demo && (
          <div id="demo-make-bar" className="bg-cream-card rounded-2xl p-4 border border-cream-dark text-xs text-forest/80">
            <span className="font-bold text-forest">This is the demo.</span> Ideas come from the example meals, not from your craving.{" "}
            <Link href="/start" className="font-bold underline hover:text-lime-hover">Make a real one?</Link>
          </div>
        )}
        <div className={`space-y-6${demo || complete ? "" : " hidden"}`}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="font-script text-2xl text-forest font-bold">{review ? "Last step" : `Question ${q + 1} of ${QUESTIONS.length}`}</span>
            <div className="flex gap-1 flex-1 max-w-xs" aria-hidden="true">
              {[...QUESTIONS, null].map((_, k) => (
                <span key={k} className={`h-1.5 flex-1 rounded-full transition-colors ${k < q ? "bg-lime" : k === q ? "bg-forest" : "bg-cream-dark"}`}></span>
              ))}
            </div>
          </div>

          <div key={q} className="quiz-enter space-y-6">
            <div>
              <h2 ref={quizTitle} tabIndex={-1} className="font-serif text-3xl font-bold text-forest focus:outline-none text-balance">
                {review ? "Check your answers" : QUESTIONS[q].title}
              </h2>
              <p className="text-sm text-forest/70 mt-1.5">{review ? "Change anything, then get your ideas." : QUESTIONS[q].hint}</p>
            </div>
            {review ? (
              <dl className="border border-cream-dark rounded-2xl overflow-hidden">
                {QUESTIONS.map((item, k) => (
                  <div key={item.title} className={`grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(150px,30%)_1fr_auto] gap-x-4 gap-y-1 px-4 py-3.5 items-start${k ? " border-t border-cream-dark" : ""}`}>
                    <dt className="text-xs font-bold text-forest/70 flex items-center gap-2"><i className={`fa-solid ${item.icon} w-4 text-center`}></i>{item.title.replace(/\?$/, "")}</dt>
                    <dd className="text-sm font-semibold text-forest min-w-0 break-words col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">{item.summary}</dd>
                    <button type="button" onClick={() => goTo(k, true)} className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto text-xs font-extrabold text-forest underline decoration-lime decoration-2 underline-offset-4 hover:text-lime-hover">
                      Change<span className="sr-only"> {item.title}</span>
                    </button>
                  </div>
                ))}
              </dl>
            ) : QUESTIONS[q].body}
          </div>

          {quizError && <p role="alert" className="text-xs font-bold text-red-700">{quizError}</p>}

          <div className="flex items-center justify-between gap-3 pt-5 border-t border-cream-dark">
            <button type="button" onClick={() => goTo(q - 1)} className={`flex items-center gap-2 text-sm font-bold text-forest px-2 py-3 hover:text-lime-hover${q === 0 ? " invisible" : ""}`}>
              <i className="fa-solid fa-arrow-left text-xs"></i> Back
            </button>
            <span className="hidden sm:inline text-[11px] text-forest/70">Press <kbd className="font-sans font-bold bg-cream-card border border-cream-dark rounded-md px-1.5 py-px">Enter</kbd> to continue</span>
            <button type="button" onClick={next} className="flex-1 sm:flex-none bg-lime hover:bg-lime-hover text-forest font-bold py-3.5 px-7 rounded-2xl text-base transition-all shadow-glow flex items-center justify-center gap-2">
              <span>{review ? "Show me 4 ideas" : toSummary ? "Back to summary" : "Continue"}</span>
              <i className="fa-solid fa-arrow-right text-sm"></i>
            </button>
          </div>
        </div>
      </div>

      {/* STEP 2: PICK AN IDEA (mockup markup; idea cards without a photo) */}
      <div id="make-step-2" className={`space-y-6 max-w-5xl mx-auto${step !== 2 ? " hidden" : ""}`}>
        {run.ideas ? (
          <div id="step-2-ideas" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-script text-2xl text-forest font-bold">Step 2 of 3</span>
                <h2 className="font-serif text-3xl font-bold text-forest">Pick One Meal Idea</h2>
              </div>
              <button onClick={startOver} className="text-xs font-bold text-forest/70 hover:text-forest flex items-center gap-1.5">
                <i className="fa-solid fa-arrow-left text-[10px]"></i>
                <span>Back to edit</span>
              </button>
            </div>
            {run.demo && (
              <div id="demo-note" className="bg-cream-card rounded-2xl p-4 border border-cream-dark text-xs text-forest/80">
                <span className="font-bold text-forest">Demo mode.</span> These are the pre-built example meals closest to your craving, not made from it.
                To make your own, <Link href="/start" className="font-bold underline hover:text-lime-hover">use your API key</Link>.
              </div>
            )}
            <div id="ideas-card-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {run.ideas.map((idea) => (
                <div key={idea.idea_id} onClick={() => { setChanges(""); setPreview(idea); }}
                  className="bg-white rounded-3xl p-5 border border-cream-dark shadow-soft hover:shadow-card hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between group">
                  <div>
                    <AiLabel className="mb-2" />
                    <h3 className="font-serif font-bold text-lg text-forest leading-snug">{idea.name}</h3>
                    <p className="text-xs text-forest/70 mt-1 line-clamp-2">{idea.one_line}</p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-cream-dark flex items-center justify-between text-xs font-bold text-forest">
                    <span>~{Math.round(idea.rough_macros?.kcal)} kcal</span>
                    <span className="text-lime-hover bg-lime-soft px-2.5 py-0.5 rounded-md">~{Math.round(idea.rough_macros?.protein_g)}g Protein</span>
                  </div>
                </div>
              ))}
            </div>
            {/* !mt-0: the parent's space-y-6 margin would push this fixed layer 24px down */}
            {preview && (
              <div className="fixed inset-0 !mt-0 z-50 bg-forest/40 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
                <div role="dialog" aria-modal="true" aria-labelledby="idea-preview-title" onClick={(e) => e.stopPropagation()}
                  className="bg-white rounded-3xl p-8 shadow-card border border-cream-dark max-w-lg w-full space-y-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-script text-2xl text-forest font-bold">Idea {preview.idea_id} of {run.ideas.length}</span>
                      <AiLabel />
                    </div>
                    <h2 id="idea-preview-title" className="font-serif text-3xl font-bold text-forest leading-snug">{preview.name}</h2>
                  </div>
                  <p className="text-sm text-forest/80">{preview.one_line}</p>
                  {preview.main_ingredients?.length > 0 && (
                    <div>
                      <span className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">Main ingredients</span>
                      <div className="flex flex-wrap gap-2">
                        {preview.main_ingredients.map((f) => (
                          <span key={f} className="inline-flex items-center bg-cream-dark text-forest text-xs px-3 py-1 rounded-full font-medium">{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {preview.changes && <p className="text-xs text-forest/70"><span className="font-bold text-forest">Your changes:</span> {preview.changes}</p>}
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {[["kcal", preview.rough_macros?.kcal, ""], ["Protein", preview.rough_macros?.protein_g, "g"],
                      ["Carbs", preview.rough_macros?.carbs_g, "g"], ["Fat", preview.rough_macros?.fat_g, "g"]].map(([label, v, unit]) => (
                      <div key={label} className="bg-cream/50 border border-cream-dark rounded-2xl p-3">
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-forest/70">{label}</span>
                        <span className="block text-sm font-bold text-forest mt-0.5">~{Math.round(v)}{unit}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-forest/70">Quick estimate per serving. The real macros come with the recipe.</p>
                  <div>
                    <label htmlFor="idea-changes" className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">Want to change something?</label>
                    <div className="flex items-start gap-2">
                      <textarea id="idea-changes" rows={2} maxLength={300} value={changes} onChange={(e) => setChanges(e.target.value)}
                        disabled={run.demo} placeholder={run.demo ? "Needs your API key (Profile)" : "e.g. no potatoes, add cucumber"}
                        className="flex-1 bg-cream/50 border border-cream-dark rounded-xl px-4 py-2.5 text-xs text-forest placeholder-forest/40 focus:outline-none focus:border-forest disabled:cursor-not-allowed"></textarea>
                      <button disabled={run.demo || revising || !changes.trim()} onClick={() => revise(preview)}
                        className="bg-forest text-cream font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-forest-light disabled:opacity-40 disabled:cursor-not-allowed">
                        Update idea
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button onClick={() => pick(preview)}
                      className="flex-1 bg-lime hover:bg-lime-hover text-forest font-bold py-3 rounded-2xl text-sm transition-all shadow-glow">
                      Select meal
                    </button>
                    <button onClick={() => setPreview(null)} autoFocus
                      className="flex-1 bg-cream-card hover:bg-cream-dark text-forest font-bold py-3 rounded-2xl text-sm transition-colors border border-cream-dark">
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div id="step-2-loading" className="space-y-6 text-center py-12">
            <div className="inline-flex items-center gap-3 bg-forest text-lime px-5 py-2.5 rounded-full text-xs font-bold shadow-md">
              <i className={`fa-solid ${run.error ? "fa-circle-exclamation" : "fa-circle-notch fa-spin"}`}></i>
              <span>{run.error || "Creating your ideas..."}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[0, 1, 2, 3].map((n) => (
                <div key={n} className="bg-white rounded-3xl p-4 border border-cream-dark space-y-3 animate-skeleton">
                  <div className="h-4 bg-cream-dark rounded w-3/4"></div>
                  <div className="h-3 bg-cream-dark rounded w-1/2"></div>
                  <div className="h-3 bg-cream-dark rounded w-2/3"></div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-6">
              <button onClick={startOver} className="text-xs font-bold text-forest/70 hover:text-forest inline-flex items-center gap-1.5">
                <i className="fa-solid fa-arrow-left text-[10px]"></i>
                <span>Back to edit</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* STEP 3: YOUR MEAL (the finished meal opens as its recipe page) */}
      <div id="make-step-3" className={`space-y-6 max-w-5xl mx-auto text-center py-12${step !== 3 ? " hidden" : ""}`}>
        <div className="inline-flex items-center gap-3 bg-forest text-lime px-5 py-2.5 rounded-full text-xs font-bold shadow-md">
          <i className={`fa-solid ${run.error ? "fa-circle-exclamation" : "fa-circle-notch fa-spin"}`}></i>
          <span>{run.error || progressText(progress) || "Cooking your meal... recipe, packs and macros take a moment"}</span>
        </div>
        <div className="bg-white rounded-3xl p-6 border border-cream-dark space-y-3 animate-skeleton max-w-3xl mx-auto">
          <div className="h-40 bg-cream-dark rounded-2xl"></div>
          <div className="h-4 bg-cream-dark rounded w-3/4"></div>
          <div className="h-3 bg-cream-dark rounded w-1/2"></div>
        </div>
        {run.error && (
          <div className="flex items-center justify-center gap-6">
            <button onClick={() => setRun({ ...run, step: 2, error: null, recipe: null, idea: null })} className="text-xs font-bold text-forest/70 hover:text-forest inline-flex items-center gap-1.5">
              <i className="fa-solid fa-arrow-left text-[10px]"></i>
              <span>Back to the ideas</span>
            </button>
            {run.recipe && (
              <button onClick={retryEngine} className="text-xs font-bold text-forest hover:text-lime-hover">Try again</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
