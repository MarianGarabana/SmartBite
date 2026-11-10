"use client";
// Paste a recipe (decided 2026-11-09, Q14): a box on My Recipes. The user's AI key reads the pasted text into foods
// and grams (lib/llm.js importRecipe); if the text states no servings (or more than 8) the user says how many to
// cook; the engine works out macros, packs and prices for this browser's profile and country; the meal opens as its
// recipe page with the editor open, so the user checks foods and grams first. Nothing is sent before "Read recipe".
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { productsFor } from "../lib/cartmath";
import { evaluateMeal } from "../lib/engine";
import { MAX_PASTE, MAX_SERVINGS, importSlug, importedRequest, needsServings } from "../lib/importer";
import { importRecipe } from "../lib/llm";
import { toMeal } from "../lib/meal";
import { fieldValue } from "../lib/profile";
import { engineEstimates, llmReady, readActiveProducts, readBudget, readLlm, readProfile, saveLocalMeal } from "../lib/store";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-1.5";
const field = "bg-cream/50 border border-cream-dark rounded-xl px-3 py-2.5 text-sm text-forest focus:outline-none focus:border-forest";

export function PasteRecipe({ onClose }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [reply, setReply] = useState(null); // the model's reading, kept while the user picks servings
  const [servings, setServings] = useState("2");
  const [busy, setBusy] = useState(null); // null | "read" | "engine"
  const [error, setError] = useState("");
  const [ready, setReady] = useState(true);
  useEffect(() => { setReady(llmReady(readLlm())); }, []);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // Engine request -> meal kept in this browser (not in My Recipes until Save) -> recipe page with the editor open
  const open = async (read, cook) => {
    setBusy("engine");
    try {
      const profile = readProfile();
      const targets = { kcal: Number(fieldValue(profile, "kcal_target")) || null, protein: Number(fieldValue(profile, "protein_g_target")) || null,
        carbsMax: null, fatMax: null };
      const { request, check } = importedRequest(read, { servings: cook, targets, budgetPerServing: readBudget() });
      const out = await evaluateMeal({ ...request, profile, products: productsFor(request.recipe, readActiveProducts()), ...engineEstimates() });
      const slug = importSlug(request.recipe.title);
      const doc = { ...out, imported: true, import_check: check };
      toMeal(slug, doc, { kind: "local" }); // throws if the page could not show it
      if (!saveLocalMeal(slug, doc)) throw new Error("this browser blocks storage.");
      router.push(`/recipes/${slug}?edit=1`);
    } catch (e) {
      setError(`Not opened: ${e.message}`);
      setBusy(null);
    }
  };

  const read = async () => {
    if (!text.trim()) return setError("Paste a recipe first.");
    setError("");
    setBusy("read");
    try {
      const data = await importRecipe({ paste: text, llm: readLlm() });
      if (needsServings(data)) {
        setReply(data);
        setServings(String(Math.min(MAX_SERVINGS, data.servings || 2)));
        return setBusy(null);
      }
      await open(data, data.servings);
    } catch (e) {
      setError(`Not read: ${e.message}`);
      setBusy(null);
    }
  };

  const cook = Number(servings);
  const servingsOk = Number.isInteger(cook) && cook >= 1 && cook <= MAX_SERVINGS;

  return (
    <div className="fixed inset-0 z-50 bg-forest/40 flex items-center justify-center p-4" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="paste-recipe-title" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-6 sm:p-8 shadow-card border border-cream-dark max-w-2xl w-full space-y-5 max-h-[90vh] overflow-y-auto">
        <div>
          <span className="font-script text-2xl text-forest font-bold">From any website or book</span>
          <h2 id="paste-recipe-title" className="font-serif text-3xl font-bold text-forest leading-snug">Paste a recipe</h2>
          <p className="text-xs text-forest/70 mt-1">Your AI reads the foods and amounts. SmartBite keeps the recipe as written and works out macros, packs and prices. You check the foods and grams before you save it.</p>
        </div>

        {!ready ? (
          <p role="alert" className="text-xs text-forest bg-lime-soft rounded-2xl p-4">
            Reading a recipe uses your own AI key. <Link href="/profile" className="font-bold underline hover:text-lime-hover">Add your key in your Profile</Link> first.
          </p>
        ) : !reply ? (
          <div className="space-y-3">
            <label htmlFor="paste-text" className={label}>Recipe text</label>
            <textarea id="paste-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_PASTE} disabled={Boolean(busy)}
              placeholder={"Paste the title, the ingredients and the steps.\n\ne.g.\nLentil soup\n1 onion, diced\n2 carrots\n1/2 lb red lentils\n..."}
              className={`w-full ${field} leading-relaxed`} />
            <button onClick={read} disabled={Boolean(busy)}
              className="w-full bg-lime hover:bg-lime-hover disabled:opacity-60 text-forest font-bold py-3.5 rounded-2xl text-sm transition-all shadow-glow flex items-center justify-center gap-2">
              <i className={`fa-solid ${busy ? "fa-circle-notch fa-spin" : "fa-wand-magic-sparkles"}`}></i>
              <span>{busy === "read" ? "Reading the recipe..." : busy === "engine" ? "Working out macros, packs and prices..." : "Read recipe"}</span>
            </button>
            <span className="block text-[11px] text-forest/70">The text goes to your AI provider with your key, like a new meal. Nothing else about you is sent with it.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-forest"><span className="font-bold">{reply.title}</span>: {reply.servings
              ? `the recipe makes ${reply.servings} servings. SmartBite plans up to ${MAX_SERVINGS}.`
              : "the recipe does not say how many servings it makes."}</p>
            <label htmlFor="paste-servings" className={label}>{reply.servings ? "How many servings do you want to cook?" : "How many servings does it make?"}</label>
            <input id="paste-servings" type="number" min={1} max={MAX_SERVINGS} step={1} inputMode="numeric" value={servings}
              onChange={(e) => setServings(e.target.value)} disabled={Boolean(busy)} className={`${field} w-24 text-right`} />
            <button onClick={() => servingsOk ? (setError(""), open(reply, cook)) : setError(`Pick 1 to ${MAX_SERVINGS} servings.`)} disabled={Boolean(busy)}
              className="w-full bg-lime hover:bg-lime-hover disabled:opacity-60 text-forest font-bold py-3.5 rounded-2xl text-sm transition-all shadow-glow flex items-center justify-center gap-2">
              <i className={`fa-solid ${busy ? "fa-circle-notch fa-spin" : "fa-arrow-right"}`}></i>
              <span>{busy ? "Working out macros, packs and prices..." : "Continue"}</span>
            </button>
          </div>
        )}

        {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
        <div className="flex justify-end">
          <button onClick={() => onClose()} disabled={Boolean(busy)} className="text-xs font-bold text-forest/70 hover:text-forest disabled:opacity-50">Close</button>
        </div>
      </div>
    </div>
  );
}
