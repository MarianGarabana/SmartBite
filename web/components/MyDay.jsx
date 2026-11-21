"use client";
// My Day (2026-11-14): one day of meals against daily targets. Four slots, each with saved recipes (by slug, so edits
// flow through and a deleted recipe drops out) and foods typed by hand. All math is in lib/day.js. The real app keeps
// the day in this browser until Clear day; the demo starts from a sample day in page state and never writes it.
// No meal photos here: Home must not load the photos of hidden tabs.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MIN_SERVINGS, SAMPLE_TARGETS, SLOTS, STEP, addExtra, addRecipe, dailyTargets, emptyDay, hasTargets, mealForWhatsLeft,
  microsToday, pickerList, readExtra, removeItem, resolveDay, sampleDay, stepServings, targetStatus } from "../lib/day";
import { foodName, t, tx, useLang } from "../lib/i18n";
import { recipeMeals } from "../lib/meal";
import { clearDay, onStoreChange, readDay, readProfile, writeDay } from "../lib/store";

const ICONS = { breakfast: "fa-mug-saucer", lunch: "fa-bowl-food", snack: "fa-apple-whole", dinner: "fa-utensils" };
const MACROS = [["kcal", "Calories", "kcal"], ["protein_g", "Protein", "g"], ["carbs_g", "Carbs", "g"], ["fat_g", "Fat", "g"]];
const r0 = (v) => Math.round(v);
const servingsText = (s) => (s === 1 ? t("{n} serving", { n: s }) : t("{n} servings", { n: s }));
// The status line under a target bar, in the page language: same text as lib/day.js targetStatus in English
const statusText = (s, unit) => {
  const amount = `${Math.abs(s.left)} ${unit}`;
  if (s.over) return t("{amount} over", { amount });
  return s.kind === "goal" ? t("{amount} left", { amount }) : t("{amount} under", { amount });
};
// Foods typed by hand: a known food shows its name in the page language (the demo's banana); anything else as typed
const rowName = (row) => (row.kind === "extra" ? foodName(row.name) : row.name);

export default function MyDay({ hidden, meals, mealsReady, demo, onMakeMeal, showToast }) {
  useLang();
  const recipes = useMemo(() => recipeMeals(meals, demo), [meals, demo]);
  // Demo: the sample day lives in page state only. Real app: null until this browser's storage is read.
  const [day, setDay] = useState(() => (demo ? sampleDay(recipes) : null));
  const [targets, setTargets] = useState(demo ? SAMPLE_TARGETS : null);
  useEffect(() => {
    if (demo) return undefined;
    const read = () => {
      setDay(readDay());
      setTargets(dailyTargets(readProfile()));
    };
    read();
    return onStoreChange(read);
  }, [demo]);
  const update = (next) => {
    setDay(next);
    if (!demo && !writeDay(next)) showToast(t("Not saved: this browser blocks storage. The day is kept until you reload."));
  };

  // A recipe is shown only once the meals are read, so a saved item never flashes as missing
  const ready = day !== null && (demo || mealsReady);
  const resolved = useMemo(() => resolveDay(ready ? day : emptyDay(), recipes), [ready, day, recipes]);
  // Four rows, kcal, protein, carbs, fat; a row with target null has no target set
  const targeted = !!targets && hasTargets(targets);
  const status = targeted ? targetStatus(resolved.totals, targets).filter((x) => x.target !== null) : [];
  const whatsLeft = targets ? mealForWhatsLeft(resolved.totals, targets) : null;
  const micros = microsToday(resolved.rows);
  // From the stored day, not the shown rows: items of recipes no longer in My Recipes still count, so Clear day clears them
  const empty = !day || SLOTS.every((s) => (day.slots[s.id] || []).length === 0);

  const [picker, setPicker] = useState(null); // slot id while the picker is open
  const opener = useRef(null);
  const openPicker = (slotId, button) => { opener.current = button; setPicker(slotId); };
  const closePicker = () => setPicker(null);
  // Focus back on the Add button once the dialog is gone (while it is open the page behind it is inert)
  useEffect(() => {
    if (picker !== null || !opener.current) return;
    opener.current.focus();
    opener.current = null;
  }, [picker]);
  const slotOf = (id) => SLOTS.find((s) => s.id === id);
  const added = (next, name) => {
    if (next === day) showToast(t("{slot} is full. Remove something first.", { slot: t(slotOf(picker).label) }));
    else { update(next); showToast(t("Added \"{name}\" to {slot}.", { name, slot: t(slotOf(picker).label) })); }
    closePicker();
  };
  const pickRecipe = (meal) => added(addRecipe(day, picker, meal.slug, 1), meal.name);
  const pickExtra = (extra) => added(addExtra(day, picker, extra), foodName(extra.name));

  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!confirmClear) return undefined;
    const t = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(t);
  }, [confirmClear]);
  const clear = () => {
    if (!confirmClear) return setConfirmClear(true);
    setConfirmClear(false);
    if (!demo) clearDay();
    setDay(emptyDay());
    showToast(t("Day cleared."));
  };

  const makeMeal = () => {
    onMakeMeal(whatsLeft);
    showToast(whatsLeft.clamped
      ? t("What's left is outside the Make Your Meal range, so it starts at {kcal} kcal and {protein} g protein.", { kcal: whatsLeft.kcal_target, protein: whatsLeft.protein_g_target })
      : t("Make Your Meal starts at {kcal} kcal and {protein} g protein.", { kcal: whatsLeft.kcal_target, protein: whatsLeft.protein_g_target }));
  };

  return (
    <section id="tab-my-day" className={`tab-page max-w-[1360px] mx-auto px-4 sm:px-8${hidden ? " hidden" : ""}`}>
      <div className="space-y-8">
        <div>
          <span className="font-script text-3xl text-forest font-bold">{demo ? t("Sample day") : t("Plan your day")}</span>
          <h1 className="font-serif text-4xl font-bold text-forest">{t("My Day")}</h1>
          <p className="text-xs text-forest/70 mt-2 max-w-2xl">
            {demo
              ? t("A sample day made from demo meals, with sample targets. Change anything you like; a reload brings the sample back.")
              : t("Add what you eat today and see what is left of your daily targets. The day stays in this browser until you clear it.")}
          </p>
        </div>

        {/* Totals against the daily targets: kcal and protein are goals, carbs and fat are limits */}
        <div id="day-targets" className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-serif font-bold text-xl text-forest">{t("Today so far")}</h2>
              <p className="text-xs text-forest/70">{demo ? t("Against sample targets for the demo.") : targeted ? t("Against your daily targets from your Profile.") : t("Totals for everything in your day.")}</p>
            </div>
            {whatsLeft && (
              <button id="day-make-meal" type="button" onClick={makeMeal}
                className="bg-forest hover:bg-forest-light text-lime font-bold text-xs px-5 py-2.5 rounded-full transition-all inline-flex items-center gap-2">
                <i className="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                <span>{t("Make a meal for what's left")}</span>
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-6">
            {MACROS.map(([key, label, unit]) => {
              const s = status.find((x) => x.key === key);
              const total = r0(resolved.totals[key]);
              const warn = s && s.kind === "limit" && s.over;
              return (
                <div key={key} id={`day-total-${key}`} className="space-y-2 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-forest/70 block">{t(label)}{s ? (s.kind === "limit" ? t(", at most") : t(", goal")) : ""}</span>
                  <p className="text-forest tabular-nums">
                    <span className="font-serif font-bold text-2xl">{total}</span>
                    <span className="text-xs text-forest/70">{s ? ` / ${s.target} ${unit}` : ` ${unit}`}</span>
                  </p>
                  {s && (
                    <>
                      <div aria-hidden="true" className="h-2 rounded-full bg-cream-dark overflow-hidden">
                        <div className={`h-full rounded-full transition-[width] duration-300 ${warn ? "bg-amber-500" : "bg-lime"}`} style={{ width: `${s.bar}%` }}></div>
                      </div>
                      <p className={`day-status text-xs font-bold ${warn ? "text-amber-700" : "text-forest"}`} data-over={s.over ? "true" : "false"} data-kind={s.kind}>
                        {warn && <i className="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true"></i>}
                        {statusText(s, unit)}
                      </p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {!demo && targets !== null && !targeted && (
            <p id="day-targets-note" className="text-xs text-forest/80 bg-cream-card border border-cream-dark rounded-2xl px-4 py-3">
              <i className="fa-solid fa-bullseye mr-2 text-forest/70" aria-hidden="true"></i>
              {tx("Set your daily targets in your {profile} to see what's left.", {
                profile: <Link href="/profile" className="font-bold underline hover:text-lime-hover">{t("Profile")}</Link> })}
            </p>
          )}
        </div>

        {/* The four slots */}
        <div id="day-slots" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {resolved.slots.map((slot) => (
            <article key={slot.id} id={`day-slot-${slot.id}`} aria-labelledby={`day-slot-${slot.id}-title`}
              className="bg-white rounded-3xl p-5 sm:p-6 shadow-soft border border-cream-dark flex flex-col gap-4 min-w-0">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-forest text-lime flex items-center justify-center shrink-0">
                  <i className={`fa-solid ${ICONS[slot.id]} text-sm`} aria-hidden="true"></i>
                </span>
                <div className="min-w-0">
                  <h2 id={`day-slot-${slot.id}-title`} className="font-serif font-bold text-xl text-forest leading-tight">{t(slot.label)}</h2>
                  <p className="day-subtotal text-xs text-forest/70 tabular-nums">{t("{kcal} kcal · {protein}g protein", { kcal: r0(slot.subtotal.kcal), protein: r0(slot.subtotal.protein_g) })}</p>
                </div>
              </div>
              {slot.rows.length > 0 ? (
                <ul className="space-y-2 flex-1">
                  {slot.rows.map((row) => (
                    <li key={row.id} className="day-item bg-cream/50 border border-cream-dark rounded-2xl p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {row.kind === "recipe" ? (
                            <Link href={`/recipes/${row.slug}`} className="font-serif font-bold text-sm text-forest leading-snug hover:text-lime-hover break-words">{row.name}</Link>
                          ) : (
                            <span className="font-serif font-bold text-sm text-forest leading-snug break-words">{rowName(row)}</span>
                          )}
                          <p className="text-[11px] text-forest/70 tabular-nums">
                            {t("{kcal} kcal · {protein}g protein", { kcal: r0(row.kcal), protein: r0(row.protein_g) })}{row.kind === "extra" ? t(" · your own") : ""}
                          </p>
                        </div>
                        <button type="button" onClick={() => update(removeItem(day, slot.id, row.id))} aria-label={t("Remove {name} from {slot}", { name: rowName(row), slot: t(slot.label) })}
                          className="w-8 h-8 shrink-0 rounded-full text-forest/50 hover:text-red-700 hover:bg-white flex items-center justify-center transition-colors">
                          <i className="fa-solid fa-xmark text-sm" aria-hidden="true"></i>
                        </button>
                      </div>
                      {row.kind === "recipe" && (
                        <div className="flex items-center gap-2" role="group" aria-label={t("Servings of {name}", { name: row.name })}>
                          <button type="button" onClick={() => update(stepServings(day, slot.id, row.id, -STEP))} disabled={row.servings <= MIN_SERVINGS}
                            aria-label={t("Fewer servings of {name}", { name: row.name })}
                            className="w-8 h-8 rounded-full bg-white border border-cream-dark text-forest hover:border-forest disabled:opacity-40 disabled:hover:border-cream-dark flex items-center justify-center transition-colors">
                            <i className="fa-solid fa-minus text-[10px]" aria-hidden="true"></i>
                          </button>
                          <span className="day-servings text-xs font-bold text-forest min-w-[5.5rem] text-center tabular-nums" aria-live="polite">{servingsText(row.servings)}</span>
                          <button type="button" onClick={() => update(stepServings(day, slot.id, row.id, STEP))} aria-label={t("More servings of {name}", { name: row.name })}
                            className="w-8 h-8 rounded-full bg-white border border-cream-dark text-forest hover:border-forest flex items-center justify-center transition-colors">
                            <i className="fa-solid fa-plus text-[10px]" aria-hidden="true"></i>
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-forest/70 flex-1">{ready ? t("Nothing here yet.") : ""}</p>
              )}
              <button type="button" onClick={(e) => openPicker(slot.id, e.currentTarget)} aria-label={t("Add to {slot}", { slot: t(slot.label) })} disabled={!ready}
                className="self-start bg-forest hover:bg-forest-light disabled:opacity-50 text-lime font-bold text-xs px-5 py-2.5 rounded-full transition-all inline-flex items-center gap-2">
                <i className="fa-solid fa-plus text-[10px]" aria-hidden="true"></i>
                <span>{t("Add")}</span>
              </button>
            </article>
          ))}
        </div>

        {/* Fiber and % daily values over the recipe items, scaled by servings */}
        <div id="day-micros" className="bg-white rounded-3xl p-6 sm:p-8 shadow-soft border border-cream-dark space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-serif font-bold text-xl text-forest">{t("Fiber and vitamins today")}</h2>
              <p className="text-xs text-forest/70">{t("Added up from the recipes in your day, for the servings you eat.")}</p>
            </div>
            <span className="text-xs bg-forest text-lime font-bold px-3 py-1 rounded-full whitespace-nowrap">{t("Whole day")}</span>
          </div>
          {micros.fiber || micros.nutrients.length ? (
            <ul id="day-micros-list" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
              {[...(micros.fiber ? [{ key: "fiber", label: "Fiber", pct: micros.fiber.pct, bar: Math.min(100, micros.fiber.pct),
                amount: `${micros.fiber.grams} g` }] : []), ...micros.nutrients].map((n) => (
                <li key={n.key} className="text-xs">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-forest">
                      {t(n.label)}
                      {n.partial ? <><span aria-hidden="true" className="text-forest/70">*</span><span className="sr-only">{t(" (some foods have no data)")}</span></> : null}
                    </span>
                    <span className="text-forest/70 whitespace-nowrap">{n.amount ? `${n.amount} ` : ""}<span className="font-bold text-forest ml-2">{n.pct}%</span></span>
                  </div>
                  <div aria-hidden="true" className="h-1.5 mt-1.5 rounded-full bg-cream-dark overflow-hidden">
                    <div className="h-full rounded-full bg-lime" style={{ width: `${n.bar}%` }}></div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-forest/70">{ready ? t("Add a recipe to see fiber, vitamins and minerals for the day.") : ""}</p>
          )}
          <div className="pt-4 border-t border-cream-dark space-y-1 text-[11px] text-forest/70">
            <p>{t("% of the daily value for an adult. Fiber is out of 25 g a day.")}</p>
            {micros.notCounted.length > 0 && (
              <p id="day-not-counted">{t("Not counted, no vitamin data: {names}.", { names: micros.notCounted.map((n) => foodName(n)).join(", ") })}</p>
            )}
            {micros.nutrients.some((n) => n.partial) && <p>{t("* Some foods have no data for this nutrient, so the real amount may be higher.")}</p>}
          </div>
        </div>

        <div className="flex justify-center">
          <button id="day-clear" type="button" onClick={clear} onBlur={() => setConfirmClear(false)} disabled={!ready || empty}
            className={`text-xs font-bold rounded-full px-5 py-2.5 border transition-colors inline-flex items-center gap-2 disabled:opacity-40 ${confirmClear ? "bg-red-700 border-red-700 text-white" : "bg-white border-cream-dark text-forest/80 hover:text-red-700 hover:border-red-700"}`}>
            <i className="fa-regular fa-trash-can" aria-hidden="true"></i>
            <span>{confirmClear ? t("Tap again to clear the day") : t("Clear day")}</span>
          </button>
        </div>
      </div>

      {picker && (
        <Picker slot={slotOf(picker)} recipes={recipes} demo={demo} onRecipe={pickRecipe} onExtra={pickExtra} onClose={closePicker} />
      )}
    </section>
  );
}

const fieldLabel = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2";
const fieldInput = "w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest";
const EXTRA_FIELDS = [["kcal", "Calories (kcal)"], ["protein", "Protein (g)"], ["carbs", "Carbs (g)"], ["fat", "Fat (g)"]];

// "+ Add" opens this native modal dialog: the user's recipes with a search box (the slot's category first), or a
// food typed by hand. Escape, the X and a click outside close it; focus goes back to the Add button.
function Picker({ slot, recipes, demo, onRecipe, onExtra, onClose }) {
  useLang();
  const box = useRef(null);
  const search = useRef(null);
  const [tab, setTab] = useState("recipes");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ name: "", kcal: "", protein: "", carbs: "", fat: "" });
  const [error, setError] = useState("");
  useEffect(() => {
    const d = box.current;
    if (d && !d.open) d.showModal();
    search.current?.focus();
  }, []);
  const list = pickerList(recipes, slot.id, query);
  const tabs = [["recipes", "Your recipes"], ["own", "Add your own"]];
  const choose = (id) => {
    setTab(id);
    document.getElementById(`day-tab-${id}`)?.focus();
  };
  const onTabKey = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    choose(tab === "recipes" ? "own" : "recipes");
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const out = readExtra(form);
    if (!out.ok) return setError(out.error);
    onExtra(out.extra);
  };

  return (
    <dialog ref={box} id="day-picker" aria-labelledby="day-picker-title" onClose={onClose}
      onClick={(e) => e.target === box.current && box.current.close()}
      className="w-[calc(100%-2rem)] max-w-lg max-h-[90vh] p-0 rounded-3xl bg-white text-forest shadow-card border border-cream-dark backdrop:bg-forest/40">
      <div className="p-6 sm:p-8 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="font-script text-2xl text-forest font-bold">{t("My Day")}</span>
            <h2 id="day-picker-title" className="font-serif text-3xl font-bold text-forest leading-snug">{t("Add to {slot}", { slot: t(slot.label) })}</h2>
          </div>
          <button type="button" onClick={() => box.current.close()} aria-label={t("Close")}
            className="w-9 h-9 shrink-0 rounded-full text-forest/70 hover:text-forest hover:bg-forest/5 flex items-center justify-center">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        <div role="tablist" aria-label={t("What to add")} className="flex gap-2" onKeyDown={onTabKey}>
          {tabs.map(([id, label]) => (
            <button key={id} id={`day-tab-${id}`} type="button" role="tab" aria-selected={tab === id} aria-controls={`day-panel-${id}`}
              tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}
              className={`font-semibold px-4 py-2 rounded-full text-xs transition-all border ${tab === id ? "bg-forest text-lime border-forest" : "bg-white hover:bg-cream-dark text-forest border-cream-dark"}`}>
              {t(label)}
            </button>
          ))}
        </div>

        <div id="day-panel-recipes" role="tabpanel" aria-labelledby="day-tab-recipes" hidden={tab !== "recipes"} className="space-y-4">
          <div className="relative">
            <label htmlFor="day-search" className="sr-only">{t("Search your recipes")}</label>
            <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-forest/40" aria-hidden="true"></i>
            <input ref={search} id="day-search" type="text" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search recipes or ingredients...")}
              className="w-full bg-white border border-cream-dark rounded-full pl-9 pr-4 py-2.5 text-sm text-forest placeholder-forest/40 focus:outline-none focus:border-forest" />
          </div>
          {list.length > 0 ? (
            <ul id="day-picker-list" className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {list.map(({ meal, match }) => (
                <li key={meal.slug}>
                  <button type="button" onClick={() => onRecipe(meal)}
                    className="w-full text-left bg-cream/50 border border-cream-dark hover:border-forest rounded-2xl px-4 py-3 flex items-center justify-between gap-3 transition-colors">
                    <span className="min-w-0">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-forest/70">{t(match && slot.category ? slot.category : meal.category)}</span>
                      <span className="block font-serif font-bold text-sm text-forest leading-snug">{meal.name}</span>
                      <span className="block text-[11px] text-forest/70 tabular-nums">{t("{kcal} kcal · {protein}g protein per serving", { kcal: meal.kcal, protein: meal.protein })}</span>
                    </span>
                    <span className="w-8 h-8 shrink-0 rounded-full bg-forest text-lime flex items-center justify-center" aria-hidden="true">
                      <i className="fa-solid fa-plus text-[10px]"></i>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="bg-cream-card border border-cream-dark rounded-2xl p-4 text-xs text-forest/80 space-y-2">
              <p>
                {recipes.length === 0
                  ? demo ? t("No demo recipes here.") : t("You have no saved recipes yet. Make a meal, or paste a recipe in My Recipes.")
                  : t("No recipes match \"{query}\".", { query: query.trim() })}
              </p>
              <button type="button" onClick={() => choose("own")} className="font-bold underline hover:text-lime-hover">{t("Add your own food instead")}</button>
            </div>
          )}
        </div>

        <form id="day-panel-own" role="tabpanel" aria-labelledby="day-tab-own" hidden={tab !== "own"} onSubmit={submit} noValidate className="space-y-4">
          <div>
            <label htmlFor="day-extra-name" className={fieldLabel}>{t("Name")}</label>
            <input id="day-extra-name" value={form.name} onChange={set("name")} maxLength={80} placeholder={t("e.g. Banana")} autoComplete="off"
              aria-describedby="day-extra-help" className={fieldInput} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {EXTRA_FIELDS.map(([k, label]) => (
              <div key={k}>
                <label htmlFor={`day-extra-${k}`} className={fieldLabel}>{t(label)}</label>
                <input id={`day-extra-${k}`} inputMode="decimal" value={form[k]} onChange={set(k)} placeholder={k === "kcal" ? "" : t("optional")}
                  aria-describedby="day-extra-help" className={fieldInput} />
              </div>
            ))}
          </div>
          <p id="day-extra-help" className="text-[11px] text-forest/70">{t("Name and calories are needed. Protein, carbs and fat are optional; empty counts as 0.")}</p>
          {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">
              {t("Add to {slot}", { slot: t(slot.label) })}
            </button>
            <button type="button" onClick={() => box.current.close()} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2.5">{t("Cancel")}</button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
