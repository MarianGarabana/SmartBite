"use client";
// Recipe page: the "Your meal" layout from step 3 of Make Your Meal in the mockup, copied 1:1; the steps section
// shows for meals that have steps. Servings scale the ingredients, the shopping table and the MyFitnessPal block;
// macro tiles stay per serving. Prices the user types (EUR per pack, kept in this browser as products for their
// store) price the shopping table at once in the browser; the meal engine then runs the meal again with the products
// for the budget check. With a country set
// in Settings (Spain by default), the engine fills the other lines with estimated prices, shown grey with "est.".
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { withPrices } from "../lib/cartmath";
import { estimateTitle, periodText, toMeal } from "../lib/meal";
import { mfpBlock } from "../lib/mfp";
import { packRow, totals } from "../lib/packs";
import { MAX_PHOTO_BYTES, deletePhoto, putPhoto, usePhoto } from "../lib/photos";
import { COUNTRIES, MAX_PRICE_EUR, deleteLocalMeal, setLinePrice, setSaved } from "../lib/store";
import { AiLabel, Footer, Header, MealImage, RECIPE_TABLE as T, Toast, money, moneySymbol, grams, useCart, useCurrency, useEstimates, useEvaluations, useMeals, usePrices,
  useProducts, useToast } from "./Chrome";
import { ProductCell, ProductDialog } from "./ProductDialog";

// Demo meals come from the server; meals made in this browser are looked up in its storage
export default function RecipePage({ slug, demoMeals }) {
  useCurrency();
  const router = useRouter();
  const { meals, ready } = useMeals(demoMeals);
  const meal = meals.find((m) => m.slug === slug);
  if (meal) return <RecipeView key={meal.slug} meal={meal} meals={meals} router={router} />;
  return <MissingMeal meals={meals} ready={ready} router={router} />;
}

// Small "price per pack" field for a shopping row with a pack size; an empty field removes the price. Also meant for
// the Cart's "no price" cell. An estimated price shows as the placeholder until the user types one.
export function PriceInput({ row, prices, onBlocked, onFocus, onBlur }) {
  const value = row.priceKey ? prices[row.priceKey] : undefined;
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  // A price changed elsewhere (another meal, another tab) shows here, but typing "1." is never rewritten to "1"
  useEffect(() => {
    setDraft((d) => (parse(d) === (value ?? null) ? d : value == null ? "" : String(value)));
  }, [value]);
  if (!row.priceKey) return null;
  const change = (text) => {
    setDraft(text);
    const price = parse(text);
    if (price === undefined) return; // not a price yet: keep the last one
    if (!setLinePrice(row, price)) onBlocked?.();
  };
  return (
    <input type="text" inputMode="decimal" value={draft} onChange={(e) => change(e.target.value)} onFocus={onFocus} onBlur={onBlur}
      placeholder={row.estimate ? row.packPrice.toFixed(2) : `${moneySymbol()} / pack`} title={row.estimate ? estimateTitle(row.pricePeriod, row.priceRegion) : undefined}
      aria-label={`Price for one pack of ${row.product || row.ingredient}${row.estimate ? ` (estimated ${money(row.packPrice)})` : ""}`}
      className="w-20 bg-cream/50 border border-cream-dark rounded-xl px-2 py-1 text-xs text-forest text-right font-normal placeholder-forest/40 focus:outline-none focus:border-forest" />
  );
}

// "" is no price (null); "2,5" and "2.5" are 2.5; anything else is undefined
function parse(text) {
  const t = String(text).trim().replace(",", ".");
  if (!t) return null;
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n <= MAX_PRICE_EUR ? n : undefined;
}

// The meal run again by the engine with the user's products and country (estimates), for the servings shown, always:
// the saved meal's packs are picked for its own servings. The same evaluation as the Cart (Chrome.jsx
// useEvaluations); while a new reply loads, the last one stays.
function usePricedEvaluation(meal, servings, products, estimates) {
  const replies = useEvaluations(meal.source ? [{ id: "recipe", meal, servings }] : [], products, estimates);
  return replies.recipe || null;
}

function MissingMeal({ meals, ready, router }) {
  const { toast, showToast } = useToast();
  const { cart } = useCart(showToast, meals);
  const go = (tab) => router.push(tab === "home" ? "/" : `/?tab=${tab}`);
  return (
    <div className="desktop-frame flex flex-col justify-between">
      <Header active="recipes" onNavigate={go} cartCount={cart.meals.length} />
      <main className="flex-1 py-6">
        {ready && (
          <section className="tab-page max-w-[1360px] mx-auto px-8">
            <div className="bg-white rounded-3xl p-12 text-center border border-cream-dark space-y-4 max-w-xl mx-auto my-12">
              <h3 className="font-serif font-bold text-xl text-forest">This meal is not here</h3>
              <p className="text-xs text-forest/60">It may have been deleted, or it was made in another browser. Meals you make stay in the browser that made them.</p>
              <button onClick={() => go("recipes")} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-6 py-3 rounded-full transition-all">
                Back to recipes
              </button>
            </div>
          </section>
        )}
      </main>
      <Footer onNavigate={go} />
      <Toast toast={toast} />
    </div>
  );
}

function RecipeView({ meal, meals, router }) {
  // Opens at the servings the meal was made for: its steps, packs and budget are for those (1 to 8, the stepper's range)
  const [servings, setServings] = useState(Math.min(8, Math.max(1, meal.servings || 1)));
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(null); // shopping row whose product is being edited
  const { toast, showToast } = useToast();
  const { cart, add } = useCart(showToast, meals);
  const go = (tab) => router.push(tab === "home" ? "/" : `/?tab=${tab}`);

  // Lines hold grams for the servings they were computed for; scale them to the chosen servings. The engine's last
  // reply wins over the saved meal and stays while a newer one loads (the table never falls back to the saved
  // meal's packs); the user's prices are applied in the browser at once.
  const prices = usePrices();
  const products = useProducts();
  const estimates = useEstimates();
  const priced = usePricedEvaluation(meal, servings, products, estimates);
  const shown = priced?.doc ? { meal: toMeal(meal.slug, priced.doc), servings: priced.servings } : { meal, servings: meal.servings };
  const rows = withPrices(shown.meal, prices).lines.map((l) => packRow(l, (l.needed * servings) / shown.servings));
  const t = totals(rows);
  // The budget check is the engine's for these exact prices and servings; the estimate note can use the last reply
  const budget = priced && !priced.pending ? priced.doc?.evaluation.pack : null;
  const lastPack = priced?.doc?.evaluation.pack;
  const optionalRows = rows.filter((r) => r.optional && r.packSize);
  const mfp = mfpBlock(meal.name, servings, [...meal.ingredients, ...meal.mfpExtra].map((i) => ({ ...i, grams: i.grams * servings })));
  const copyMFPText = () =>
    navigator.clipboard.writeText(mfp).then(() => {
      setCopied(true);
      showToast("MyFitnessPal text copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => showToast("Could not copy. Select the text and copy it."));
  // Photo: made in Gemini from the prompt and dropped here; it stays in this browser
  const photo = usePhoto(meal.slug);
  const hasPhoto = Boolean(photo || meal.images.length);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const showPhotoCard = !hasPhoto || photoOpen;
  const copyPrompt = () => navigator.clipboard.writeText(meal.photoPrompt).then(() => showToast("Prompt copied. Paste it in Gemini."))
    .catch(() => showToast("Could not copy. Select the prompt and copy it."));
  const uploadPhoto = async (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("That is not an image.");
    if (file.size > MAX_PHOTO_BYTES) return showToast("Not saved: image is larger than 20 MB.");
    setUploading(true);
    const ok = await putPhoto(meal.slug, file);
    setUploading(false);
    if (!ok) return showToast("Not saved: this browser blocks storage.");
    showToast("Photo saved in this browser.");
    setPhotoOpen(false);
  };
  const saveToRecipes = () =>
    showToast(setSaved(meal.slug, true) ? `Saved "${meal.name}" in My Recipes!` : "Not saved: this browser blocks storage.");
  // Delete meal (meals made in this browser only): first click asks, second click deletes for good
  const [confirmDelete, setConfirmDelete] = useState(false);
  const askedAt = useRef(0);
  const deleteMeal = async () => {
    if (!confirmDelete) {
      askedAt.current = Date.now();
      setConfirmDelete(true);
      return setTimeout(() => setConfirmDelete(false), 4000);
    }
    if (Date.now() - askedAt.current < 500) return; // a double-click is not a confirmation
    if (!deleteLocalMeal(meal.slug)) return showToast("Not deleted. Try again.");
    await deletePhoto(meal.slug);
    router.push("/?tab=recipes");
  };
  const noPrices = t.priced === 0;
  // Estimates in the budget: where they come from, for the note under the table
  const est = lastPack?.prices_estimated ? lastPack.estimate_source : null;
  const estPlace = est?.region_name ? `${est.region_name} average price paid (${COUNTRIES.find((c) => c.id === est.country)?.label || est.country}'s where the region has none)`
    : est ? `${COUNTRIES.find((c) => c.id === est.country)?.label || est.country} average price paid` : null;
  const estLabel = est ? `${estPlace}, MAPA, ${periodText(est.period_from, est.period_to)}` : null;

  return (
    <div className="desktop-frame flex flex-col justify-between">
      <Header active="recipes" onNavigate={go} cartCount={cart.meals.length} />

      <main className="flex-1 py-6">
        <section id="recipe-page" className="tab-page space-y-8 max-w-[1360px] mx-auto px-8">
          <div className="space-y-8 max-w-5xl mx-auto">
            <div className="flex items-center justify-between">
              <button onClick={() => go("recipes")} className="text-xs font-bold text-forest/70 hover:text-forest flex items-center gap-1.5">
                <i className="fa-solid fa-arrow-left text-[10px]"></i>
                <span>Back to recipes</span>
              </button>
            </div>

            {/* Meal Header & Macros */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-5 h-64 rounded-2xl overflow-hidden relative">
                <MealImage meal={meal} label className="w-full h-full object-cover" textClass="text-2xl" />
                {hasPhoto && (
                  <button onClick={() => setPhotoOpen(!photoOpen)}
                    className="absolute bottom-3 right-3 bg-white/90 hover:bg-white text-forest text-[11px] font-bold px-3 py-1.5 rounded-xl shadow-soft">
                    <i className="fa-solid fa-camera mr-1.5"></i>{photoOpen ? "Close" : "Replace photo"}
                  </button>
                )}
              </div>
              <div className="md:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-widest text-lime-hover bg-lime-soft px-3 py-1 rounded-full">{meal.kind === "demo" ? "Demo Meal" : "Chosen Custom Recipe"}</span>
                  <AiLabel />
                  {meal.fixture && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">Test fixture</span>
                  )}
                </div>
                <h2 id="picked-meal-title" className="font-serif text-3xl font-bold text-forest">{meal.name}</h2>
                <div className="flex items-center gap-4 text-xs font-medium text-forest/70">
                  <span className="flex items-center gap-2">
                    <i className="fa-regular fa-user mr-1 text-lime-hover"></i>
                    <span className="flex items-center border border-cream-dark rounded-xl overflow-hidden bg-cream/50 w-28">
                      <button onClick={() => setServings(Math.max(1, servings - 1))} className="w-8 h-9 text-forest font-bold hover:bg-cream-dark">-</button>
                      <span id="servings-count" className="flex-1 text-center text-xs font-bold text-forest">{servings}</span>
                      <button onClick={() => setServings(Math.min(8, servings + 1))} className="w-8 h-9 text-forest font-bold hover:bg-cream-dark">+</button>
                    </span>
                    <span>{servings === 1 ? "Serving" : "Servings"}</span>
                  </span>
                  {meal.time ? (
                    <span><i className="fa-regular fa-clock mr-1 text-lime-hover"></i><span>{meal.time}</span> Mins</span>
                  ) : null}
                </div>

                {/* 4 Macro Tiles (per serving) */}
                <div className="grid grid-cols-4 gap-3 pt-2">
                  <div className="bg-cream-card p-3 rounded-2xl text-center border border-cream-dark">
                    <span className="text-[10px] uppercase font-bold text-forest/60 block">Calories</span>
                    <span id="tile-kcal" className="font-bold text-base text-forest">{meal.macros.kcal}</span>{" "}
                    <span className="text-[10px] text-forest/50">kcal</span>
                  </div>
                  <div className="bg-lime-soft p-3 rounded-2xl text-center border border-lime/30">
                    <span className="text-[10px] uppercase font-bold text-forest/70 block">Protein</span>
                    <span id="tile-protein" className="font-bold text-base text-forest">{meal.macros.protein}</span>{" "}
                    <span className="text-[10px] text-forest/50">grams</span>
                  </div>
                  <div className="bg-cream-card p-3 rounded-2xl text-center border border-cream-dark">
                    <span className="text-[10px] uppercase font-bold text-forest/60 block">Carbs</span>
                    <span id="tile-carbs" className="font-bold text-base text-forest">{meal.macros.carbs}</span>{" "}
                    <span className="text-[10px] text-forest/50">grams</span>
                  </div>
                  <div className="bg-cream-card p-3 rounded-2xl text-center border border-cream-dark">
                    <span className="text-[10px] uppercase font-bold text-forest/60 block">Fat</span>
                    <span id="tile-fat" className="font-bold text-base text-forest">{meal.macros.fat}</span>{" "}
                    <span className="text-[10px] text-forest/50">grams</span>
                  </div>
                </div>
                <p className="text-[11px] text-forest/60">AI picked the foods and grams. Macros and packs are computed in code.</p>
              </div>
            </div>

            {/* Make the photo: prompt for Gemini, then drop the image here (it stays in this browser) */}
            {showPhotoCard && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-5">
                <div>
                  <span className="font-script text-2xl text-forest font-bold">Your photo</span>
                  <h3 className="font-serif text-2xl font-bold text-forest">Make the photo in Gemini</h3>
                </div>
                {meal.photoPrompt ? (
                  <div className="space-y-3">
                    <p className="text-xs text-forest/70">1. Copy this prompt and paste it in Gemini.</p>
                    <pre className="bg-cream-card p-4 rounded-2xl text-xs text-forest/80 leading-relaxed whitespace-pre-wrap border border-cream-dark">{meal.photoPrompt}</pre>
                    <div className="flex gap-3">
                      <button onClick={copyPrompt} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
                        <i className="fa-regular fa-copy"></i><span>Copy prompt</span>
                      </button>
                      <a href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer"
                        className="bg-cream-card hover:bg-cream-dark text-forest font-bold text-xs px-4 py-2 rounded-xl transition-colors border border-cream-dark flex items-center gap-2">
                        <i className="fa-solid fa-arrow-up-right-from-square"></i><span>Open Gemini</span>
                      </a>
                    </div>
                  </div>
                ) : null}
                <p className="text-xs text-forest/70">{meal.photoPrompt ? "2. " : ""}Drop the image here, or click to choose it. It stays in this browser.</p>
                <label
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); uploadPhoto(e.dataTransfer.files[0]); }}
                  className={`flex flex-col items-center justify-center gap-2 h-40 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${dragging ? "border-lime bg-lime-soft" : "border-cream-dark bg-cream/50 hover:bg-cream-card"}`}>
                  <i className={`fa-solid ${uploading ? "fa-circle-notch fa-spin" : "fa-image"} text-2xl text-forest/50`}></i>
                  <span className="text-xs font-bold text-forest">{uploading ? "Saving the photo..." : "Drop image here"}</span>
                  <span className="text-[11px] text-forest/50">PNG, JPEG or WebP</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files[0])} />
                </label>
              </div>
            )}

            {/* Ingredients Grams & Steps */}
            <div className={`grid grid-cols-1 gap-8${meal.steps?.length ? " md:grid-cols-2" : ""}`}>
              <div className="bg-white rounded-3xl p-6 shadow-soft border border-cream-dark">
                <h3 className="font-serif font-bold text-xl text-forest mb-4">Recipe Ingredients</h3>
                <ul id="picked-ingredients-list" className="space-y-2.5 text-xs text-forest/80">
                  {meal.ingredients.map((ing) => (
                    <li key={ing.name} className="flex items-center justify-between py-1 border-b border-cream-dark/40">
                      <span>
                        <span className="font-semibold text-forest">{ing.name}</span>
                        {ing.note ? <span className="text-[11px] text-forest/60 ml-1.5">{ing.note}</span> : null}
                      </span>
                      <span className="text-forest/70">
                        {ing.units ? `${ing.units * servings} ${ing.units * servings === 1 ? "egg" : "eggs"} (` : ""}
                        {ing.est ? "~" : ""}{grams(ing.grams * servings)}{ing.units ? ")" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {meal.seasoning ? (
                  <p id="seasoning-line" className="text-xs text-forest/60 pt-3">
                    <span className="font-semibold text-forest">Seasoning</span> ({meal.pantryNote}): {meal.seasoning}
                  </p>
                ) : null}
              </div>
              {meal.steps?.length ? (
                <div className="bg-white rounded-3xl p-6 shadow-soft border border-cream-dark">
                  <h3 className="font-serif font-bold text-xl text-forest mb-4">Preparation Steps</h3>
                  <ol id="picked-steps-list" className="space-y-3 text-xs text-forest/80 list-decimal pl-4">
                    {meal.steps.map((s, i) => <li key={i} className="leading-relaxed">{s}</li>)}
                  </ol>
                  {servings !== meal.servings ? (
                    <p id="steps-servings-note" className="text-xs text-forest/60 pt-3">
                      Steps are written for {meal.servings} {meal.servings === 1 ? "serving" : "servings"}. The ingredient list shows the grams for {servings} {servings === 1 ? "serving" : "servings"}.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Ingredients to Buy Table */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-serif font-bold text-xl text-forest">Ingredients to Buy</h3>
                  <p className="text-xs text-forest/60">Whole packs in typical sizes, so you see what you buy and what is left over.</p>
                </div>
                <span className="text-xs bg-forest text-lime font-bold px-3 py-1 rounded-full">Typical packs</span>
              </div>

              <div className="overflow-x-auto">
                <table className={T.table}>
                  <thead className={T.head}>
                    <tr className="border-b border-cream-dark bg-cream/60 text-forest/70 uppercase text-[10px] font-bold">
                      <th className={T.th}>Ingredient</th>
                      <th className={T.th}>Product</th>
                      <th className={T.thNum}>Pack Size</th>
                      <th className={T.thNum}>Packs</th>
                      <th className={T.thNum}>Needed</th>
                      <th className={T.thNum}>Bought</th>
                      <th className={T.thNum}>Leftover</th>
                      <th className={`${T.thNum} text-right`}>Price</th>
                    </tr>
                  </thead>
                  <tbody id="pack-table-body" className={T.body}>
                    {rows.filter((r) => !r.optional).map((r) =>
                      r.packSize ? (
                        <tr key={r.key} className={T.row}>
                          <td className={T.ingredient}>{r.ingredient}</td>
                          <td className={T.product}><ProductCell row={r} onEdit={setEditing} /></td>
                          <td data-label="Pack" className={`${T.num} text-forest/70`}>{grams(r.packSize)}</td>
                          <td data-label="Packs" className={`${T.num} font-bold text-forest`}>{r.packs}</td>
                          <td data-label="Needed" className={`${T.num} text-forest/70`}>{grams(r.needed)}</td>
                          <td data-label="Bought" className={`${T.num} text-forest/70`}>{grams(r.bought)}</td>
                          <td data-label="Leftover" className={T.num}>
                            <span className="font-bold text-forest">{grams(r.left)}</span>
                            {r.status ? (
                              <span className={`ml-1 text-[10px] ${r.status === "Keeps" ? "bg-lime-soft text-forest font-bold" : "bg-amber-100 text-amber-900"} px-1.5 py-0.5 rounded`}>{r.status}</span>
                            ) : null}
                          </td>
                          <td className={T.price}>
                            <span className="inline-flex items-center justify-end gap-2">
                              <PriceInput row={r} prices={prices} onBlocked={() => showToast("Not saved: this browser blocks storage.")} />
                              {r.hasPrice && r.estimate ? (
                                <span className="min-w-[3.25rem] text-right font-normal text-forest/60" title={estimateTitle(r.pricePeriod, r.priceRegion)}>
                                  {money(r.price)} <span className="text-[10px]">est.</span>
                                </span>
                              ) : r.hasPrice ? <span className="min-w-[3.25rem] text-right">{money(r.price)}</span> : null}
                            </span>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.key} className={T.row}>
                          <td className={T.ingredient}>{r.ingredient}</td>
                          <td className={T.product}>no pack size yet</td>
                          <td data-label="Pack" className={`${T.num} text-forest/70`}></td>
                          <td data-label="Packs" className={`${T.num} font-bold text-forest`}></td>
                          <td data-label="Needed" className={`${T.num} text-forest/70`}>{grams(r.needed)}</td>
                          <td data-label="Bought" className={`${T.num} text-forest/70`}></td>
                          <td data-label="Leftover" className={T.num}></td>
                          <td className={T.price}></td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>

              {/* Optional: not in the costs below; tick them in the cart if you need to buy them */}
              {optionalRows.length > 0 && (
                <p id="recipe-optional" className="text-xs text-forest/70">
                  <span className="font-bold text-forest">Optional, you may already have these:</span>{" "}
                  {optionalRows.map((r, i) => (
                    <span key={r.key} title={r.estimate ? estimateTitle(r.pricePeriod, r.priceRegion) : undefined}>
                      {i ? " · " : ""}{r.ingredient}{r.hasPrice ? ` ${money(r.price)}${r.estimate ? " est." : ""}` : ""}
                    </span>
                  ))}
                  . Not counted in the costs below; tick them in your cart if you need to buy them.
                </p>
              )}

              {/* Metrics Summary Footer */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-4 border-t border-cream-dark bg-cream-card/50 p-4 rounded-2xl">
                <div>
                  <span className="text-[11px] text-forest/60 block">Cost of what you use:</span>
                  <span id="summary-used-cost" className="font-bold text-sm text-forest">{noPrices ? "No prices yet" : money(t.used)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-forest/60 block">
                    {t.unpriced && !noPrices
                      ? `Partial total (${t.unpriced} ${t.unpriced === 1 ? "item has" : "items have"} no price yet):`
                      : "Cost of purchase:"}
                  </span>
                  <span id="summary-bought-cost" className="font-bold text-sm text-forest">{noPrices ? "No prices yet" : money(t.bought)}</span>
                </div>
                {/* Cost of what one serving uses, so it does not change with the servings chosen */}
                <div>
                  <span className="text-[11px] text-forest/60 block">{t.unpriced && !noPrices ? "Cost per serving (partial):" : "Cost per serving:"}</span>
                  <span id="summary-serving-cost" className="font-bold text-sm text-forest">{noPrices ? "No prices yet" : money(t.used / servings)}</span>
                </div>
                <div>
                  <span className="text-[11px] text-forest/60 block">Total waste/leftover:</span>
                  <span id="summary-waste-metrics" className="font-bold text-sm text-forest">{grams(t.wasteGrams)}{noPrices ? "" : ` (${money(t.wasteCost)})`}</span>
                </div>
              </div>

              {/* Budget: checked by the engine only when every bought line has a price */}
              <p id="budget-status" className="text-xs text-forest/70">
                {noPrices && !priced?.pending ? "Add prices from your store to check the budget."
                  : priced?.error ? "Budget check unavailable: the meal engine did not answer. Costs above use your prices."
                  : !budget ? "Checking the budget..."
                  : !budget.budget_check_complete ? <>
                      <span className="font-bold text-forest">Budget check incomplete{est ? " (estimated)" : ""}:</span>{" "}
                      {budget.unpriced.length} {budget.unpriced.length === 1 ? "item has" : "items have"} no price yet.
                    </>
                  : budget.within_budget ? <>
                      <span className="font-bold text-forest">Within budget{est ? " (estimated)" : ""}:</span> {money(budget.cart_total_eur)} of your {money(priced.budget)} for {servings} {servings === 1 ? "serving" : "servings"}.
                    </>
                  : <>
                      <span className="font-bold text-amber-900">Over budget{est ? " (estimated)" : ""}</span> by {money(budget.over_budget_eur)}: {money(budget.cart_total_eur)} for a budget of {money(priced.budget)} for {servings} {servings === 1 ? "serving" : "servings"}.
                    </>}
                {est ? <> Prices marked est. are estimates ({estLabel}). Type your store&apos;s price to replace one.</> : null}
              </p>
            </div>

            {/* MyFitnessPal Sync Box */}
            <div className="bg-forest text-cream rounded-3xl p-6 shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-barcode text-lime text-lg"></i>
                  <h3 className="font-serif font-bold text-lg text-white">MyFitnessPal Quick Import</h3>
                </div>
                <button onClick={copyMFPText} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
                  <i className="fa-regular fa-copy"></i>
                  <span id="copy-btn-text">{copied ? "Copied ✓" : "Copy to Clipboard"}</span>
                </button>
              </div>
              <pre id="mfp-text-block" className="bg-forest-card p-4 rounded-2xl text-xs font-mono text-cream/90 leading-relaxed overflow-x-auto border border-cream/10">{mfp}</pre>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
              <button onClick={() => add(meal, servings)} className="w-full sm:flex-1 bg-lime hover:bg-lime-hover text-forest font-bold py-4 rounded-2xl text-sm transition-all shadow-glow flex items-center justify-center gap-2">
                <i className="fa-solid fa-basket-shopping"></i>
                <span>Add to my cart</span>
              </button>
              {meal.kind === "local" && (
                <button onClick={saveToRecipes} className="w-full sm:flex-1 bg-transparent border-2 border-forest hover:bg-forest hover:text-cream text-forest font-bold py-4 rounded-2xl text-sm transition-all flex items-center justify-center gap-2">
                  <i className="fa-regular fa-bookmark"></i>
                  <span>Save in my recipes</span>
                </button>
              )}
              {meal.kind === "local" && (
                <button onClick={deleteMeal} className={`w-full sm:flex-1 bg-transparent border-2 font-bold py-4 rounded-2xl text-sm transition-all flex items-center justify-center gap-2 ${confirmDelete ? "border-red-600 text-red-600" : "border-forest/20 text-forest/60 hover:border-red-600 hover:text-red-600"}`}>
                  <i className="fa-regular fa-trash-can"></i>
                  <span>{confirmDelete ? "Click again to delete for good" : "Delete meal"}</span>
                </button>
              )}
            </div>
          </div>
        </section>
      </main>

      <Footer onNavigate={go} />
      {editing && <ProductDialog row={editing} onClose={() => setEditing(null)} showToast={showToast} />}
      <Toast toast={toast} />
    </div>
  );
}
