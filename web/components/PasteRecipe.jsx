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
import { LINK_MESSAGE, MAX_PASTE, MAX_SERVINGS, importSlug, importedRequest, needsServings } from "../lib/importer";
import { importRecipe } from "../lib/llm";
import { toMeal } from "../lib/meal";
import { fieldValue } from "../lib/profile";
import { t, tx, useLang } from "../lib/i18n";
import { engineEstimates, llmReady, readActiveProducts, readBudget, readOwnLlm, readProfile, saveLocalMeal } from "../lib/store";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-1.5";
const field = "bg-cream/50 border border-cream-dark rounded-xl px-3 py-2.5 text-sm text-forest focus:outline-none focus:border-forest";

// lib/importer.js LINK_MESSAGE in the page language
const linkText = () => t("That looks like a link. SmartBite does not open websites: open the page, select the ingredients and the steps, copy them, and paste the text here.");

export function PasteRecipe({ onClose }) {
  useLang();
  const router = useRouter();
  const [text, setText] = useState("");
  const [reply, setReply] = useState(null); // the model's reading, kept while the user picks servings
  const [servings, setServings] = useState("2");
  const [busy, setBusy] = useState(null); // null | "read" | "engine"
  const [error, setError] = useState("");
  const [ready, setReady] = useState(true);
  useEffect(() => { setReady(llmReady(readOwnLlm())); }, []);
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
      if (!saveLocalMeal(slug, doc)) throw new Error(t("this browser blocks storage."));
      router.push(`/recipes/${slug}?edit=1`);
    } catch (e) {
      setError(t("Not opened: {reason}", { reason: e.message }));
      setBusy(null);
    }
  };

  const read = async () => {
    if (!text.trim()) return setError(t("Paste a recipe first."));
    setError("");
    setBusy("read");
    try {
      const data = await importRecipe({ paste: text, llm: readOwnLlm() });
      if (needsServings(data)) {
        setReply(data);
        setServings(String(Math.min(MAX_SERVINGS, data.servings || 2)));
        return setBusy(null);
      }
      await open(data, data.servings);
    } catch (e) {
      setError(e.message === LINK_MESSAGE ? linkText() : t("Not read: {reason}", { reason: e.message }));
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
          <span className="font-script text-2xl text-forest font-bold">{t("From any website or book")}</span>
          <h2 id="paste-recipe-title" className="font-serif text-3xl font-bold text-forest leading-snug">{t("Paste a recipe")}</h2>
          <p className="text-xs text-forest/70 mt-1">{t("Your AI reads the foods and amounts. SmartBite keeps the recipe as written and works out macros, packs and prices. You check the foods and grams before you save it.")}</p>
        </div>

        {!ready ? (
          <p role="alert" className="text-xs text-forest bg-lime-soft rounded-2xl p-4">
            {tx("Reading a recipe uses your own AI key. {link} first.", { link: <Link href="/profile" className="font-bold underline hover:text-lime-hover">{t("Add your key in your Profile")}</Link> })}
          </p>
        ) : !reply ? (
          <div className="space-y-3">
            <label htmlFor="paste-text" className={label}>{t("Recipe text")}</label>
            <textarea id="paste-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_PASTE} disabled={Boolean(busy)}
              placeholder={t("Paste the title, the ingredients and the steps.\n\ne.g.\nLentil soup\n1 onion, diced\n2 carrots\n1/2 lb red lentils\n...")}
              className={`w-full ${field} leading-relaxed`} />
            <span className="block text-[11px] text-forest/70 -mt-1">{t("Paste the text, not the link.")}</span>
            <button onClick={read} disabled={Boolean(busy)}
              className="w-full bg-lime hover:bg-lime-hover disabled:opacity-60 text-forest font-bold py-3.5 rounded-2xl text-sm transition-all shadow-glow flex items-center justify-center gap-2">
              <i className={`fa-solid ${busy ? "fa-circle-notch fa-spin" : "fa-wand-magic-sparkles"}`}></i>
              <span>{busy === "read" ? t("Reading the recipe...") : busy === "engine" ? t("Working out macros, packs and prices...") : t("Read recipe")}</span>
            </button>
            <span className="block text-[11px] text-forest/70">{t("The text goes to your AI provider with your key, like a new meal. Nothing else about you is sent with it.")}</span>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-forest"><span className="font-bold">{reply.title}</span>: {reply.servings
              ? t("the recipe makes {n} servings. SmartBite plans up to {max}.", { n: reply.servings, max: MAX_SERVINGS })
              : t("the recipe does not say how many servings it makes.")}</p>
            <label htmlFor="paste-servings" className={label}>{reply.servings ? t("How many servings do you want to cook?") : t("How many servings does it make?")}</label>
            <input id="paste-servings" type="number" min={1} max={MAX_SERVINGS} step={1} inputMode="numeric" value={servings}
              onChange={(e) => setServings(e.target.value)} disabled={Boolean(busy)} className={`${field} w-24 text-right`} />
            <button onClick={() => servingsOk ? (setError(""), open(reply, cook)) : setError(t("Pick 1 to {max} servings.", { max: MAX_SERVINGS }))} disabled={Boolean(busy)}
              className="w-full bg-lime hover:bg-lime-hover disabled:opacity-60 text-forest font-bold py-3.5 rounded-2xl text-sm transition-all shadow-glow flex items-center justify-center gap-2">
              <i className={`fa-solid ${busy ? "fa-circle-notch fa-spin" : "fa-arrow-right"}`}></i>
              <span>{busy ? t("Working out macros, packs and prices...") : t("Continue")}</span>
            </button>
          </div>
        )}

        {error && <p role="alert" className="text-xs font-bold text-red-700">{error}</p>}
        <div className="flex justify-end">
          <button onClick={() => onClose()} disabled={Boolean(busy)} className="text-xs font-bold text-forest/70 hover:text-forest disabled:opacity-50">{t("Close")}</button>
        </div>
      </div>
    </div>
  );
}
