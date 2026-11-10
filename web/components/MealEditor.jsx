"use client";
// Edit a meal made in this browser (decided 2026-11-09): its name and steps (text only), its foods and grams (the
// engine recomputes macros, packs and cost, no model call), or a change asked in words (the user's AI key rewrites the
// recipe with the change on the idea, then the same engine and rerun loop as a new meal, lib/flow.js). The meal keeps
// its address and photo. The model still picks foods and grams only; every number comes from code.
import { useEffect, useMemo, useState } from "react";
import { productsFor } from "../lib/cartmath";
import { evaluateMeal } from "../lib/engine";
import { makeMeal, progressText } from "../lib/flow";
import { editProblem, editedRecipe } from "../lib/meal";
import { foods } from "../lib/names";
import { engineEstimates, llmReady, readActiveProducts, readLlm, readLocalMeals, readProfile, replaceLocalMeal } from "../lib/store";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-1.5";
const field = "bg-cream/50 border border-cream-dark rounded-xl px-3 py-2.5 text-sm text-forest focus:outline-none focus:border-forest";
const input = `w-full ${field}`;

export function MealEditor({ slug, onClose, showToast }) {
  const doc = useMemo(() => readLocalMeals()[slug], [slug]);
  const [title, setTitle] = useState(doc?.recipe.title || "");
  const [stepsText, setStepsText] = useState((doc?.recipe.steps || []).join("\n"));
  const [rows, setRows] = useState(() => (doc?.recipe.ingredients || []).map((it, i) => ({ key: i, base: it, name: it.name,
    units_per_serving: it.units_per_serving || 0, amount: String(it.units_per_serving || it.grams_per_serving), pantry: it.pantry })));
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(null); // null | "save" | "ai"
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const known = useMemo(() => foods(), []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  if (!doc) return null;

  const setRow = (key, patch) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows([...rows, { key: Date.now(), isNew: true, name: "", units_per_serving: 0, amount: "100" }]);
  // What a meal keeps through an edit: its date and where it came from (shared link, pasted recipe). The list of
  // foods to check after an import is dropped once the user saves: they have checked them.
  const kept = { ...(doc?.date ? { date: doc.date } : {}), ...(doc?.shared ? { shared: true } : {}), ...(doc?.imported ? { imported: true } : {}) };
  const done = (newDoc, message) => {
    if (!replaceLocalMeal(slug, { ...newDoc, ...kept })) return setError("Not saved: this browser blocks storage.");
    showToast(message);
    onClose(true);
  };

  const save = async () => {
    const problem = editProblem({ title, stepsText, rows });
    if (problem) return setError(problem);
    setError("");
    const recipe = editedRecipe(doc.recipe, { title, stepsText, rows });
    const foodsChanged = JSON.stringify(recipe.ingredients) !== JSON.stringify(doc.recipe.ingredients);
    if (!foodsChanged) {
      const { import_check: _checked, ...rest } = doc;
      return done({ ...rest, recipe }, "Meal saved.");
    }
    setBusy("save");
    try {
      const out = await evaluateMeal({ form: doc.form, profile: readProfile(), picked_idea: doc.picked_idea, recipe,
        products: productsFor(recipe, readActiveProducts()), ...engineEstimates() });
      done(out, "Meal saved. Macros, packs and cost are updated.");
    } catch (e) {
      setError(`Not saved: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const askAi = async () => {
    const text = ask.trim();
    if (!text) return setError("Write what you want to change.");
    const llm = readLlm();
    if (!llmReady(llm)) return setError("Add your AI key in your Profile first.");
    setError("");
    setBusy("ai");
    const before = doc.picked_idea?.changes;
    const idea = { ...doc.picked_idea, changes: before ? `${before}; ${text}` : text };
    try {
      const out = await makeMeal({ idea, form: doc.form, profile: readProfile(), llm, products: readActiveProducts(),
        ...engineEstimates(), onProgress: setProgress });
      done(out.meal, "Meal changed. Macros, packs and cost are updated.");
    } catch (e) {
      setError(`Not changed: ${e.message}`);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-forest/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="meal-editor-title" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-6 sm:p-8 shadow-card border border-cream-dark max-w-2xl w-full space-y-6 max-h-[90vh] overflow-y-auto">
        <div>
          <span className="font-script text-2xl text-forest font-bold">Edit meal</span>
          <h2 id="meal-editor-title" className="font-serif text-3xl font-bold text-forest leading-snug">{doc.recipe.title}</h2>
          <p className="text-xs text-forest/70 mt-1">Saved in this browser. Changing a food or its grams recomputes macros, packs and cost.</p>
        </div>
        {doc.imported && doc.import_check && (
          <div id="import-check" className="bg-lime-soft rounded-2xl p-4 space-y-1.5 text-xs text-forest">
            <p className="font-bold">Read from your pasted recipe. Check the foods and grams per serving, then save.</p>
            {doc.import_check.filter((c) => c.why === "unknown").length > 0 && (
              <p>Not in SmartBite&apos;s food list, so left out of macros and cart: <span className="font-bold">
                {doc.import_check.filter((c) => c.why === "unknown").map((c) => c.name).join(", ")}</span>. Swap one for a listed food if you can.</p>
            )}
            {doc.import_check.filter((c) => c.why === "guessed").length > 0 && (
              <p>No amount in the recipe, so the grams are a guess: <span className="font-bold">
                {doc.import_check.filter((c) => c.why === "guessed").map((c) => c.name).join(", ")}</span>.</p>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="edit-title" className={label}>Name</label>
            <input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={input} />
          </div>
          <div>
            <span className={label}>Foods per serving</span>
            <datalist id="known-foods">{known.map((f) => <option key={f} value={f} />)}</datalist>
            <ul className="space-y-2">
              {rows.map((r) => (
                <li key={r.key} className="flex items-center gap-2">
                  <input aria-label="Food" list="known-foods" value={r.name} onChange={(e) => setRow(r.key, { name: e.target.value })}
                    disabled={!r.isNew} placeholder="Pick a food" className={`${field} flex-1 min-w-0 disabled:opacity-80`} />
                  <input aria-label={r.units_per_serving ? `${r.name} eggs per serving` : `${r.name || "Food"} grams per serving`} inputMode="decimal"
                    value={r.amount} onChange={(e) => setRow(r.key, { amount: e.target.value.replace(",", ".") })} className={`${field} w-20 shrink-0 text-right`} />
                  <span className="text-xs text-forest/70 w-10 shrink-0">{r.units_per_serving ? "eggs" : "g"}</span>
                  <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.name || "food"}`}
                    className="w-9 h-9 shrink-0 rounded-xl text-forest/70 hover:text-red-600 hover:bg-cream-card"><i className="fa-regular fa-trash-can"></i></button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={addRow} className="mt-2 text-xs font-bold text-forest hover:text-lime-hover flex items-center gap-1.5">
              <i className="fa-solid fa-plus text-[10px]"></i>Add a food
            </button>
            <span className="block text-[11px] text-forest/70 mt-1">Pick from the list so SmartBite knows its nutrition and packs.</span>
          </div>
          <div>
            <label htmlFor="edit-steps" className={label}>Steps (one per line)</label>
            <textarea id="edit-steps" rows={6} value={stepsText} onChange={(e) => setStepsText(e.target.value)} className={`${input} leading-relaxed`} />
          </div>
          <button onClick={save} disabled={Boolean(busy)}
            className="w-full bg-lime hover:bg-lime-hover disabled:opacity-60 text-forest font-bold py-3.5 rounded-2xl text-sm transition-all shadow-glow flex items-center justify-center gap-2">
            <i className={`fa-solid ${busy === "save" ? "fa-circle-notch fa-spin" : "fa-check"}`}></i>
            <span>{busy === "save" ? "Updating macros and packs..." : "Save changes"}</span>
          </button>
        </div>

        <div className="space-y-3 pt-5 border-t border-cream-dark">
          <label htmlFor="edit-ask" className={label}>Or ask the AI to change it</label>
          <textarea id="edit-ask" rows={2} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="e.g. less rice, add spinach, make it spicier"
            className={input} />
          <button onClick={askAi} disabled={Boolean(busy)}
            className="bg-forest hover:bg-forest-light disabled:opacity-60 text-cream font-bold text-xs px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2">
            <i className={`fa-solid ${busy === "ai" ? "fa-circle-notch fa-spin" : "fa-wand-magic-sparkles"}`}></i>
            <span>{busy === "ai" ? progressText(progress) || "Rewriting the recipe..." : "Change with AI"}</span>
          </button>
          <span className="block text-[11px] text-forest/70">Uses your AI key, like a new meal. Your change wins over the profile and the form.</span>
        </div>

        {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
        <div className="flex justify-end">
          <button onClick={() => onClose()} disabled={Boolean(busy)} className="text-xs font-bold text-forest/70 hover:text-forest disabled:opacity-50">Close</button>
        </div>
      </div>
    </div>
  );
}
