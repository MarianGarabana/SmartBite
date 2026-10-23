"use client";
// Port of the SmartBite desktop mockup (design freeze). Markup and classes are copied 1:1; the data is the demo
// meals plus what this browser keeps (cart, saved meals) in localStorage.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { checkForm } from "../lib/form";
import { makeMeal, progressText } from "../lib/flow";
import { generateIdeas, reviseIdea } from "../lib/llm";
import { demoIdea, estimatePlace, estimateTitle, periodText, toMeal } from "../lib/meal";
import { fieldValue } from "../lib/profile";
import { DEFAULT_BUDGET, engineEstimates, llmReady, needsSetup, readActiveProducts, readBudget, readLlm, readProfile,
  saveLocalMeal } from "../lib/store";
import { SETUP_DONE_EVENT, openSetup } from "./SetupDialog";
import { AddButton, AiLabel, Footer, Header, MealImage, Toast, money, moneySymbol, grams, useCart, useCurrency, useMeals, usePrices, useToast }
  from "./Chrome";
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
        <span className={`min-w-[3.25rem] text-right whitespace-nowrap${item.estimate ? " font-normal text-forest/60" : ""}`} title={item.estimate ? estimateTitle(item.pricePeriod, item.priceRegion) : undefined}>
          {money(item.price)}{item.estimate ? <> <span className="text-[10px]">est.</span></> : null}
        </span>
      ) : null}
    </span>
  );
}

const CATEGORIES = [
  { name: "Breakfast", img: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=250&q=80" },
  { name: "Lunch", img: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=250&q=80" },
  { name: "Dinner", img: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=250&q=80" },
  { name: "Salads", img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=250&q=80" },
  { name: "Warm Meals", img: "https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=250&q=80" },
];
// Meals show their category if they have one, else their date; "~" marks totals read as "about"
const label = (m) => m.category || m.date;
const kcal = (m) => `${m.approx ? "~" : ""}${m.kcal} kcal`;
const protein = (m) => `${m.approx ? "~" : ""}${m.protein}g`;

export default function SmartBite({ demoMeals, homeMeals, initialTab = "home" }) {
  useCurrency();
  const [tab, setTab] = useState(initialTab);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
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

  const switchTab = (id) => {
    setTab(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openCategory = (name) => {
    switchTab("recipes");
    setCategory(name);
  };

  // Demo meals are always listed; meals made in this browser show once saved ("Save in my recipes").
  const q = query.toLowerCase();
  const shown = meals.filter(
    (m) =>
      (m.kind === "demo" || m.saved) &&
      (category === "All" || m.categories.includes(category)) &&
      (!q || m.name.toLowerCase().includes(q) || m.ingredients.some((i) => i.name.toLowerCase().includes(q)))
  );

  return (
    <div className="desktop-frame flex flex-col justify-between">
      {/* HEADER / NAVIGATION BAR */}
      <Header active={tab} onNavigate={switchTab} cartCount={cart.meals.length} />

      <main className="flex-1 py-6">
        {/* TAB 1: HOME */}
        <section id="tab-home" className={`tab-page space-y-12${tab === "home" ? "" : " hidden"}`}>
          <div className="max-w-[1360px] mx-auto px-8">
            <div className="bg-forest text-cream rounded-[2.5rem] p-10 lg:p-14 relative overflow-hidden shadow-xl">
              <div className="absolute -top-32 -right-32 w-96 h-96 bg-lime/10 rounded-full blur-3xl pointer-events-none"></div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
                <div className="lg:col-span-7 space-y-6">
                  <span className="inline-block px-3.5 py-1.5 rounded-full bg-forest-light border border-lime/30 text-lime text-xs font-semibold tracking-wider">
                    Whole-pack meal planner
                  </span>
                  <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.12] text-white">
                    Meals that fit{" "}
                    <span className="font-script text-lime text-5xl sm:text-6xl block -rotate-2 -my-2">your macros</span>
                    and your budget.
                  </h1>
                  <p className="text-cream/80 text-base sm:text-lg max-w-xl font-light leading-relaxed">
                    Generate balanced single-serving or batch meal plans aligned with exact caloric requirements while keeping food waste low, with whole packs from any store.
                  </p>
                  <div className="pt-2 flex items-center gap-4">
                    <button onClick={() => switchTab("make-meal")} className="bg-lime hover:bg-lime-hover text-forest font-bold text-base px-8 py-4 rounded-full transition-all duration-300 shadow-glow flex items-center gap-3">
                      <span>Make your meal</span>
                      <i className="fa-solid fa-arrow-right text-sm"></i>
                    </button>
                  </div>
                </div>
                <div className="lg:col-span-5 flex justify-center items-center relative">
                  <div className="absolute w-[320px] h-[320px] sm:w-[380px] sm:h-[380px] bg-lime rounded-full -rotate-6 shadow-glow opacity-90"></div>
                  <div className="relative z-10 w-[300px] h-[300px] sm:w-[360px] sm:h-[360px] rounded-full overflow-hidden border-8 border-forest shadow-2xl">
                    <img src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80" alt="Healthy chicken and vegetable bowl" className="w-full h-full object-cover" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-[1360px] mx-auto px-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-forest/50">Recipe Collection</span>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-forest">Explore Categories</h2>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
              {CATEGORIES.map((c) => (
                <button key={c.name} onClick={() => openCategory(c.name)} className="group flex flex-col items-center p-6 bg-white rounded-3xl shadow-soft hover:shadow-card hover:-translate-y-1 transition-all border border-cream-dark/50">
                  <div className="w-24 h-24 rounded-full bg-cream-card group-hover:bg-lime/20 flex items-center justify-center mb-4 transition-colors overflow-hidden">
                    <img src={c.img} alt={c.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <span className="font-serif font-bold text-lg text-forest">{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="max-w-[1360px] mx-auto px-8 pt-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <span className="font-script text-2xl text-forest font-bold">Pre-built examples</span>
                <h2 className="font-serif text-3xl font-bold text-forest">Demo Meals</h2>
              </div>
              <button onClick={() => switchTab("recipes")} className="text-xs font-bold text-forest hover:text-lime-hover flex items-center gap-1.5">
                <span>View all recipes</span>
                <i className="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
            </div>
            <div id="home-kitchen-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
              {homeMeals.map((m) => (
                <div key={m.slug} className="relative bg-white rounded-3xl overflow-hidden shadow-soft border border-cream-dark/60 flex flex-col justify-between group">
                  <div className="h-40 overflow-hidden relative">
                    <MealImage meal={m} label className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <span className="absolute top-2.5 left-2.5 bg-forest/90 text-lime font-bold text-[10px] px-2.5 py-0.5 rounded-full">{kcal(m)}</span>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-forest/50 block">{label(m)}</span>
                      <h4 className="font-serif font-bold text-sm text-forest leading-snug line-clamp-2 mt-0.5"><Link href={`/recipes/${m.slug}`} className="after:absolute after:inset-0">{m.name}</Link></h4>
                    </div>
                    <div className="mt-3 pt-2 border-t border-cream-dark flex items-center justify-between">
                      <span className="text-xs font-bold text-forest">Protein: {protein(m)}</span>
                      <AddButton onAdd={() => addToCart(m)} className="relative z-10 bg-cream-card hover:bg-lime text-forest font-bold px-3 py-1.5 rounded-xl text-xs transition-colors">
                        Add
                      </AddButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="max-w-[1360px] mx-auto px-8 pt-6">
            <div className="bg-cream-card rounded-3xl p-8 border border-cream-dark flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-forest/60">How SmartBite Works</span>
                <h3 className="font-serif text-2xl font-bold text-forest">5-Step Custom Idea Engine &amp; Grocery Optimizer</h3>
                <p className="text-xs text-forest/70 max-w-2xl">
                  Input your cravings and target macros. AI writes the recipe, code matches the ingredients to typical pack sizes, works out macros and leftovers, and gives you a MyFitnessPal text list.
                </p>
              </div>
              <button onClick={() => switchTab("how-it-works")} className="bg-forest hover:bg-forest-light text-lime font-bold text-xs px-6 py-3 rounded-full transition-all whitespace-nowrap">
                Learn How It Works
              </button>
            </div>
          </div>
        </section>

        {/* TAB 2: MY RECIPES */}
        <section id="tab-recipes" className={`tab-page space-y-8 max-w-[1360px] mx-auto px-8${tab === "recipes" ? "" : " hidden"}`}>
          <div>
            <span className="font-script text-3xl text-forest font-bold">Demo and Saved Meals</span>
            <h1 className="font-serif text-4xl font-bold text-forest">My Recipes</h1>
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
            <div className="relative w-full md:w-72">
              <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-forest/40"></i>
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes or ingredients..." className="w-full bg-white border border-cream-dark rounded-full pl-9 pr-4 py-2 text-xs text-forest placeholder-forest/40 focus:outline-none focus:border-forest" />
            </div>
          </div>
          <div id="recipes-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {shown.map((m) => (
              <div key={m.slug} className="relative bg-white rounded-3xl overflow-hidden shadow-soft border border-cream-dark/60 flex flex-col justify-between group">
                <div className="h-44 overflow-hidden relative">
                  <MealImage meal={m} label className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <span className="absolute top-3 left-3 bg-forest/90 text-lime font-bold text-xs px-3 py-1 rounded-full">{kcal(m)}</span>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-forest/50">{label(m)}</span>
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
        </section>

        {/* TAB 3: MAKE YOUR MEAL */}
        <MakeMealStep1 hidden={tab !== "make-meal"} showToast={showToast} leftovers={cart.leftovers}
          demoMeals={meals.filter((m) => m.kind === "demo")} />

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
            <p className="text-xs text-forest/60">Generate your first custom meal plan or select from the demo meals to build your shopping list.</p>
            <button onClick={() => switchTab("make-meal")} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-6 py-3 rounded-full transition-all">
              Make your first meal
            </button>
          </div>

          <div id="cart-loaded-view" className={`grid grid-cols-1 lg:grid-cols-12 gap-8${cart.meals.length ? "" : " hidden"}`}>
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-serif font-bold text-xl text-forest">Added Meals</h3>
                {cart.meals.some((m) => m.adjusted) && (
                  <button onClick={resetAdjust} className="text-xs font-bold text-forest/60 hover:text-forest">Undo adjustments</button>
                )}
              </div>
              <div id="cart-meals-container" className="space-y-4">
                {cart.meals.map(({ slug }, idx) => {
                  const meal = bySlug[slug];
                  if (!meal) return null;
                  const entry = cart.meals[idx];
                  return (
                    <div key={`${slug}-${idx}`} className="bg-white rounded-2xl p-4 shadow-soft border border-cream-dark flex items-center justify-between gap-4">
                      <MealImage meal={meal} className="w-16 h-16 rounded-xl object-cover" textClass="text-[8px]" />
                      <div className="flex-1">
                        <h4 className="font-serif font-bold text-sm text-forest">{meal.name}</h4>
                        <span className="text-xs text-forest/60">
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
                <div className="flex items-center justify-between border-b border-cream-dark pb-4">
                  <div>
                    <h3 className="font-serif font-bold text-xl text-forest">Consolidated Shopping List</h3>
                    <p className="text-xs text-forest/60">Identical ingredients across all cart meals are automatically merged into single store packs.</p>
                  </div>
                </div>
                {/* relative: the sr-only header label is absolute and would widen the page past this scroll box */}
                <div className="overflow-x-auto relative">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-cream-dark bg-cream/60 text-forest/70 uppercase text-[10px] font-bold">
                        <th className="p-3">Ingredient</th>
                        <th className="p-3">Product</th>
                        <th className="p-3">Pack Size</th>
                        <th className="p-3">Packs</th>
                        <th className="p-3">Used</th>
                        <th className="p-3">Bought</th>
                        <th className="p-3">Leftover</th>
                        <th className="p-3 text-right">Price</th>
                        <th className="p-3"><span className="sr-only">Already have</span></th>
                      </tr>
                    </thead>
                    <tbody id="cart-consolidated-tbody" className="divide-y divide-cream-dark/60">
                      {cart.rows.filter((r) => !r.optional && !r.have).map((item) =>
                        item.packSize ? (
                          <tr key={item.key}>
                            <td className="p-3 font-semibold text-forest">{item.ingredient}</td>
                            <td className="p-3 text-forest/70"><ProductCell row={item} onEdit={setEditing} /></td>
                            <td className="p-3 text-forest/70">{grams(item.packSize)}</td>
                            <td className="p-3 font-bold text-forest">{item.packs}</td>
                            <td className="p-3 text-forest/70">{grams(item.needed)}</td>
                            <td className="p-3 text-forest/70">{grams(item.bought)}</td>
                            <td className="p-3">
                              <span className="font-bold text-forest">{grams(item.left)}</span>{" "}
                              {item.hasPrice ? <span className="text-[10px] text-forest/60">({money(item.leftCost)})</span> : null}
                            </td>
                            <td className="p-3 text-right font-bold text-forest"><CartPrice item={item} prices={prices} onBlocked={priceBlocked} /></td>
                            <td className="p-3 text-right">
                              <button onClick={() => setHave(item.key, true, item.ingredient)} title="I already have this" aria-label={`I already have ${item.ingredient}`} className="text-forest/40 hover:text-red-600 p-1 text-sm">
                                <i className="fa-solid fa-trash-can"></i>
                              </button>
                            </td>
                          </tr>
                        ) : (
                          <tr key={item.key}>
                            <td className="p-3 font-semibold text-forest">{item.ingredient}</td>
                            <td className="p-3 text-forest/70">no pack size yet</td>
                            <td className="p-3 text-forest/70"></td>
                            <td className="p-3 font-bold text-forest"></td>
                            <td className="p-3 text-forest/70">{grams(item.needed)}</td>
                            <td className="p-3 text-forest/70"></td>
                            <td className="p-3"></td>
                            <td className="p-3 text-right font-bold text-forest"></td>
                            <td className="p-3"></td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Estimated prices count in the total, as on the recipe page */}
                {estRow && (
                  <p id="cart-estimates" className="text-xs text-forest/70">
                    Prices marked est. are estimates ({estimatePlace(estRegion)} average price paid, MAPA, {periodText(estRow.pricePeriod) || "latest 12 months"}). Type your store&apos;s price to replace one.
                  </p>
                )}
                {/* Already at home: out of the total and leftovers; Restore buys it again */}
                {haveRows.length > 0 && (
                  <div id="cart-have" className="bg-cream/50 border border-cream-dark rounded-2xl p-4 space-y-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-forest/70">Already at home</h4>
                      <p className="text-[11px] text-forest/60">Not bought and not in the total. Restore one to buy it again.</p>
                    </div>
                    <div className="space-y-2">
                      {haveRows.map((item) => (
                        <div key={item.key} className="flex items-center gap-3 text-xs text-forest">
                          <span className="font-semibold w-36 shrink-0">{item.ingredient}</span>
                          <span className="flex-1 text-forest/60">{item.product || "Typical pack"}</span>
                          <span className="text-forest/60">{grams(item.needed)} needed</span>
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
                      <p className="text-[11px] text-forest/60">They last for weeks. Tick the ones you need to buy and they are added to the total.</p>
                    </div>
                    <div className="space-y-2">
                      {optionalRows.map((item) => (
                        <label key={item.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-forest cursor-pointer">
                          <input type="checkbox" checked={!!item.included} onChange={(e) => setOptional(item.key, e.target.checked)} className="w-4 h-4 accent-forest" />
                          <span className="font-semibold sm:w-36 shrink-0">{item.ingredient}</span>
                          {/* On phones the product, then pack size and price, wrap to their own lines */}
                          <span className="flex-1 min-w-[9rem]">{item.product || "Typical pack"}</span>
                          <span className="ml-auto flex items-center gap-3">
                            <span className="text-forest/60">{item.packs > 1 ? `${item.packs} x ` : ""}{grams(item.packSize)}</span>
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
                        : "Total Purchase Cost:"}
                    </span>
                    <span id="cart-total-bought" className="font-bold text-lime text-sm">{cart.totals.priced ? money(cart.totals.bought) : "No prices yet"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-cream/70">Cost of Ingredients Consumed:</span>
                    <span id="cart-total-used" className="font-bold text-white">{cart.totals.priced ? money(cart.totals.used) : "No prices yet"}</span>
                  </div>
                  <div className="flex justify-between text-xs border-t border-cream/10 pt-2">
                    <span className="text-cream/70">Total Leftovers Waste:</span>
                    <span id="cart-total-waste" className="font-bold text-amber-300">{grams(cart.totals.wasteGrams)}{cart.totals.priced ? ` (${money(cart.totals.wasteCost)})` : ""}</span>
                  </div>
                </div>
              </div>

              {/* Leftovers: live from the cart meals; deleting a meal from the cart removes them */}
              {cart.leftovers.length > 0 && (
                <div id="cart-leftovers" className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-5">
                  <div className="border-b border-cream-dark pb-4">
                    <h3 className="font-serif font-bold text-xl text-forest">Your Leftovers</h3>
                    <p className="text-xs text-forest/60">What the meals in your cart leave over. Use them in another meal and the packs above cover it, so you buy less.</p>
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
                        <button onClick={() => setAdjust(null)} className="text-xs font-bold text-forest/60 hover:text-forest px-3 py-2">{adjust.suggestions.length ? "Cancel" : "Close"}</button>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {cart.leftovers.map((l) => (
                      <span key={l.key} className="inline-flex items-center gap-1.5 bg-cream-dark text-forest text-xs px-3 py-1 rounded-full font-medium">
                        <span className="font-bold">{l.ingredient}</span> {grams(l.left)}
                        <span className="text-[10px] text-forest/60">({l.leftCost != null ? `${money(l.leftCost)}, ` : ""}{l.status})</span>
                      </span>
                    ))}
                  </div>
                  {cart.leftoverRecipes.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-forest/70">Recipes that use them</h4>
                      {cart.leftoverRecipes.map((r) => (
                        <Link key={r.slug} href={`/recipes/${r.slug}`} className="flex items-center justify-between gap-4 bg-cream/50 border border-cream-dark rounded-2xl px-4 py-3 hover:border-forest transition-colors">
                          <span className="font-serif font-bold text-sm text-forest">{r.name}</span>
                          <span className="text-xs text-forest/60 text-right">uses {r.uses.join(", ")}</span>
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
            <span className="font-script text-3xl text-forest font-bold">Smart Meal Architecture</span>
            <h1 className="font-serif text-4xl font-bold text-forest">How SmartBite Works</h1>
            <p className="text-xs text-forest/70">Designed for precise fitness goals, accurate macro tracking, and minimal food waste.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            {[
              ["Tell us your craving", "Specify what you want to eat, foods you dislike, calorie targets, and budget limits."],
              ["Pick 1 of 4 ideas", "Select your preferred option from four AI-generated meal ideas balanced for your macros."],
              ["Whole-Pack Match", "We map ingredients to typical pack sizes to work out what you buy and what is left over."],
              ["Exact Macro Sync", "Calories and macros are computed for the exact portion consumed, excluding leftover pack weight."],
              ["Cart & MyFitnessPal", "Consolidate grocery items in your cart and copy ingredient text directly into MyFitnessPal."],
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
              <h4 className="font-serif font-bold text-lg text-forest">Optimized Leftovers Strategy</h4>
              <p className="text-xs text-forest/80 leading-relaxed">
                We try to keep leftovers low, because stores sell fixed packs and fruit and vegetables often come per kg. When leftover ingredients occur, we mark whether they can be stored long-term or should be used within 2 days.
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

// Make Your Meal. With the user's own key (Settings) the ideas and the recipe come from lib/llm.js and the engine
// (lib/engine.js) computes packs and macros; the finished meal is kept in this browser and opens as its recipe page.
// Without a key the flow runs in demo mode: the ideas are the demo meals and picking one opens its recipe page.
const toList = (v) => (Array.isArray(v) ? v.map(String) : []);
// URL slug for a meal made here: the title plus a time stamp, so two meals never share one
const mealSlug = (title) => `${String(title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "meal"}-${Date.now().toString(36)}`;
const hasGear = (gear, name) => gear.some((g) => g.toLowerCase().trim() === name);

// Step 1 form. Defaults follow the Kitchen Profile (Settings).
function MakeMealStep1({ hidden, showToast, leftovers, demoMeals }) {
  const [craving, setCraving] = useState("");
  // Leftovers in the cart: a click adds one to the craving, so the ideas build on it
  const addLeftover = (l) => setCraving((c) => (c.includes(`leftover ${l.ingredient} `) ? c :
    `${c.trim() ? `${c.trim()}, ` : ""}use my leftover ${l.ingredient} (${grams(l.left)})`));
  const [kcalTarget, setKcalTarget] = useState("450");
  const [proteinTarget, setProteinTarget] = useState("45");
  const [carbsMax, setCarbsMax] = useState("");
  const [fatMax, setFatMax] = useState("");
  const [time, setTime] = useState("30");
  const [gear, setGear] = useState({ microwave: true, stove: true, oven: true, noBlender: true });
  const [reheat, setReheat] = useState(true);
  const [lowLeftovers, setLowLeftovers] = useState(true);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [servings, setServings] = useState(1);
  const [budget, setBudget] = useState("5.50");
  // The profile lives in this browser, so it is read after the first render (and again after Create profile)
  const loadDefaults = () => {
    const profile = readProfile();
    const kcal = fieldValue(profile, "kcal_target");
    const protein = fieldValue(profile, "protein_g_target");
    if (kcal) setKcalTarget(String(kcal));
    if (protein) setProteinTarget(String(protein));
    const g = toList(fieldValue(profile, "gear", []));
    if (g.length) setGear({ microwave: hasGear(g, "microwave"), stove: hasGear(g, "stove"), oven: hasGear(g, "oven"),
      noBlender: hasGear(g, "no blender") });
    setTags(toList(fieldValue(profile, "exclude", [])));
    const b = readBudget();
    if (b !== DEFAULT_BUDGET) setBudget((b * servings).toFixed(2));
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
  const perServing = (parseFloat(budget) || 0) / servings;
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
  const demoIdeas = demoMeals.filter((m) => m.idea).slice(0, 4)
    .map((m, i) => ({ ...m.idea, ...demoIdea(m), idea_id: String(i + 1), slug: m.slug }));
  const showDemo = () => { setPreview(null); setRun({ step: 2, demo: true, ideas: demoIdeas }); };
  const startOver = () => { setPreview(null); setRun({ step: 1 }); };
  const indicator = (n) => (step >= n
    ? ["flex items-center gap-2 font-bold text-xs text-forest", "w-7 h-7 rounded-full bg-lime text-forest flex items-center justify-center font-extrabold text-xs"]
    : ["flex items-center gap-2 font-semibold text-xs text-forest/40", "w-7 h-7 rounded-full bg-cream-dark text-forest/60 flex items-center justify-center text-xs"]);
  const toggleGear = (key) => setGear({ ...gear, [key]: !gear[key] });

  const saveRequest = async () => {
    if (!craving.trim()) return showToast("Tell us what you are craving first.");
    // First time, with nothing set up: Create profile opens once (decided 2026-10-22). Skip carries on with the
    // request; after the setup the form takes the new targets and the user sends it again.
    if (needsSetup()) {
      return openSetup((state, opts) => {
        if (state !== "done") return saveRequest(); // the defaults are reloaded on SETUP_DONE_EVENT
        if (!opts?.profile) showToast("Profile saved. Check the form, then show me 4 ideas.");
      });
    }
    const { form, errors } = checkForm({
      craving, exclude: tags, kcal_target: kcalTarget, protein_g_target: proteinTarget,
      carbs_g_max: carbsMax, fat_g_max: fatMax, budget_total_eur: budget, servings, time_limit_min: time,
      // form gear: oven, no_blender, and microwave_only when the microwave is the only heat source
      gear: [gear.oven && "oven", gear.noBlender && "no_blender",
             gear.microwave && !gear.stove && !gear.oven && "microwave_only"].filter(Boolean),
      reheat_at_work: reheat, keep_leftovers_low: lowLeftovers,
    });
    if (errors.length) return showToast(`Not sent: ${errors.join(", ")}.`);
    const llm = readLlm();
    if (!llmReady(llm)) return showDemo();
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
      toMeal(slug, doc, { kind: "local" }); // throws if the page could not show it
      if (!saveLocalMeal(slug, doc)) {
        return setRun({ ...base, step: 3, loading: false, idea, recipe, error: "Not saved: this browser blocks storage." });
      }
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

      <div id="make-step-1" className={`bg-white rounded-3xl p-8 sm:p-10 shadow-soft border border-cream-dark max-w-4xl mx-auto space-y-8${step !== 1 ? " hidden" : ""}`}>
        <div>
          <span className="font-script text-2xl text-forest font-bold">Custom Single Run Generator</span>
          <h2 className="font-serif text-3xl font-bold text-forest">Define Your Next Meal</h2>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">What are you craving?</label>
            <textarea id="input-craving" rows={2} value={craving} onChange={(e) => setCraving(e.target.value)} placeholder="e.g. something warm with chicken, jasmine rice, and roasted vegetables" className="w-full bg-cream/50 border border-cream-dark rounded-2xl p-4 text-sm text-forest placeholder-forest/40 focus:outline-none focus:border-forest"></textarea>
            {leftovers.length > 0 && (
              <div id="craving-leftovers" className="mt-3 bg-cream/50 border border-cream-dark rounded-2xl p-3 space-y-2">
                <p className="text-xs text-forest/70"><span className="font-bold">Leftovers in your cart.</span> Click one to add it to your craving.</p>
                <div className="flex flex-wrap gap-2">
                  {leftovers.map((l) => (
                    <button key={l.key} onClick={() => addLeftover(l)} className="inline-flex items-center gap-1.5 bg-cream-dark hover:bg-forest hover:text-cream text-forest text-xs px-3 py-1 rounded-full font-medium transition-colors">
                      <i className="fa-solid fa-plus text-[10px]"></i>{l.ingredient} {grams(l.left)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">Foods I do NOT want</label>
            <div className="flex items-center gap-2 mb-3">
              <input type="text" id="unwanted-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Type ingredient & press Add (e.g. cilantro, olive oil)" className="flex-1 bg-cream/50 border border-cream-dark rounded-xl px-4 py-2.5 text-xs text-forest focus:outline-none focus:border-forest" />
              <button onClick={addTag} className="bg-forest text-cream font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-forest-light">Add</button>
            </div>
            <div id="unwanted-tags-container" className="flex flex-wrap gap-2">
              {tags.map((t, i) => (
                <span key={`${t}-${i}`} className="tag-item inline-flex items-center gap-1.5 bg-cream-dark text-forest text-xs px-3 py-1 rounded-full font-medium">
                  {t}
                  <button onClick={() => setTags(tags.filter((_, j) => j !== i))} className="hover:text-red-600"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">Calories target (kcal)</label>
              <input type="number" id="input-calories" value={kcalTarget} onChange={(e) => setKcalTarget(e.target.value)} className="w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">Protein target (g)</label>
              <input type="number" id="input-protein" value={proteinTarget} onChange={(e) => setProteinTarget(e.target.value)} className="w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-1.5">Max Carbs (g)</label>
              <input type="number" id="input-carbs" value={carbsMax} onChange={(e) => setCarbsMax(e.target.value)} placeholder="Optional" className="w-full bg-cream/50 border border-cream-dark rounded-xl p-2.5 text-xs text-forest" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-1.5">Max Fat (g)</label>
              <input type="number" id="input-fat" value={fatMax} onChange={(e) => setFatMax(e.target.value)} placeholder="Optional" className="w-full bg-cream/50 border border-cream-dark rounded-xl p-2.5 text-xs text-forest" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-1.5">Total budget ({moneySymbol()})</label>
              <input type="number" step="0.5" id="input-budget" value={budget} onChange={(e) => setBudget(e.target.value)} className="w-full bg-cream/50 border border-cream-dark rounded-xl p-2.5 text-xs text-forest font-bold" />
              <span id="budget-per-serving" className="block text-[11px] text-forest/60 mt-1">{money(perServing)} per serving</span>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-1.5">Servings</label>
              <div className="flex items-center border border-cream-dark rounded-xl overflow-hidden bg-cream/50">
                <button onClick={() => setServings(Math.max(1, servings - 1))} className="w-8 h-9 text-forest font-bold hover:bg-cream-dark">-</button>
                <span id="servings-count" className="flex-1 text-center text-xs font-bold">{servings}</span>
                <button onClick={() => setServings(Math.min(8, servings + 1))} className="w-8 h-9 text-forest font-bold hover:bg-cream-dark">+</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">Preparation Time Limit</label>
              <select id="input-time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-xs text-forest font-semibold">
                <option value="15">&lt; 15 mins</option>
                <option value="30">&lt; 30 mins</option>
                <option value="45">&lt; 45 mins</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2">Kitchen Gear Available</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2"><input type="checkbox" checked={gear.microwave} onChange={() => toggleGear("microwave")} className="accent-forest" /> Microwave</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={gear.stove} onChange={() => toggleGear("stove")} className="accent-forest" /> Stove</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={gear.oven} onChange={() => toggleGear("oven")} className="accent-forest" /> Oven</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={gear.noBlender} onChange={() => toggleGear("noBlender")} className="accent-forest" /> No blender</label>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-cream-dark">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-forest block">I can reheat at work</span>
                <span className="text-[11px] text-forest/60">Optimizes for microwave batch meals</span>
              </div>
              <input type="checkbox" id="toggle-reheat" checked={reheat} onChange={() => setReheat(!reheat)} className="accent-lime w-4 h-4 cursor-pointer" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-forest block">Keep leftovers low</span>
                <span className="text-[11px] text-forest/60">Stores sell fixed pack sizes, so we try to buy only what you will use.</span>
              </div>
              <input type="checkbox" id="toggle-leftovers" checked={lowLeftovers} onChange={() => setLowLeftovers(!lowLeftovers)} className="accent-lime w-4 h-4 cursor-pointer" />
            </div>
          </div>

          <button onClick={saveRequest} className="w-full bg-lime hover:bg-lime-hover text-forest font-bold py-4 rounded-2xl text-base transition-all shadow-glow flex items-center justify-center gap-2">
            <span>Show me 4 ideas</span>
            <i className="fa-solid fa-arrow-right text-sm"></i>
          </button>
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
                <span className="font-bold text-forest">Demo mode.</span> These are pre-built example meals, not made from your craving.
                To make your own, add your API key in your <Link href="/profile" className="font-bold underline hover:text-lime-hover">Profile</Link>.
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
                        <span className="block text-[11px] font-bold uppercase tracking-wider text-forest/60">{label}</span>
                        <span className="block text-sm font-bold text-forest mt-0.5">~{Math.round(v)}{unit}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-forest/60">Quick estimate per serving. The real macros come with the recipe.</p>
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
              {run.error && (
                <button onClick={showDemo} className="text-xs font-bold text-forest hover:text-lime-hover">Show the demo ideas</button>
              )}
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
            {run.recipe ? (
              <button onClick={retryEngine} className="text-xs font-bold text-forest hover:text-lime-hover">Try again</button>
            ) : (
              <button onClick={showDemo} className="text-xs font-bold text-forest hover:text-lime-hover">Show the demo ideas</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
