"use client";
// Opens a shared recipe link (/r#<code>, decided 2026-11-09). The recipe in the link goes to the meal engine with this
// browser's profile, products and country, so macros, packs and prices are this person's. The meal is kept in this
// browser like a meal made here (not in My Recipes until Save) and opens as its normal recipe page, labelled "Shared
// recipe". No key and no setup needed. The same link opened again opens the same meal.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { productsFor } from "../lib/cartmath";
import { evaluateMeal } from "../lib/engine";
import { toMeal } from "../lib/meal";
import { decodeShare, sharedRequest, sharedSlug } from "../lib/share";
import { engineEstimates, readActiveProducts, readBudget, readLocalMeals, readProfile, saveLocalMeal } from "../lib/store";
import { PageShell, useToast } from "./Chrome";

export default function SharedRecipe({ demoMeals }) {
  const router = useRouter();
  const toastState = useToast();
  const [state, setState] = useState({ status: "opening" });

  const open = async () => {
    setState({ status: "opening" });
    const code = window.location.hash.slice(1);
    let payload;
    try {
      payload = await decodeShare(code);
    } catch {
      return setState({ status: "broken" });
    }
    const slug = sharedSlug(payload.recipe.title, code);
    if (readLocalMeals()[slug]) return router.replace(`/recipes/${slug}`);
    const req = sharedRequest(payload, { budgetPerServing: readBudget() });
    try {
      const out = await evaluateMeal({ ...req, profile: readProfile(),
        products: productsFor(req.recipe, readActiveProducts()), ...engineEstimates() });
      const doc = { ...out, shared: true };
      toMeal(slug, doc, { kind: "local" }); // throws if the page could not show it
      if (!saveLocalMeal(slug, doc)) return setState({ status: "error", message: "This browser blocks storage, so the recipe cannot open here." });
      router.replace(`/recipes/${slug}`);
    } catch (e) {
      setState({ status: "error", message: e.message, title: payload.recipe.title });
    }
  };
  useEffect(() => { open(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageShell active="recipes" demoMeals={demoMeals} router={router} toastState={toastState}>
      <section id="shared-recipe" className="tab-page max-w-[1360px] mx-auto px-8">
        <div className="bg-white rounded-3xl p-12 text-center border border-cream-dark space-y-4 max-w-xl mx-auto my-12">
          {state.status === "opening" ? (
            <div role="status" className="space-y-3">
              <i className="fa-solid fa-circle-notch fa-spin text-2xl text-forest/60"></i>
              <h3 className="font-serif font-bold text-xl text-forest">Opening the shared recipe</h3>
              <p className="text-xs text-forest/70">Working out macros, packs and prices for you.</p>
            </div>
          ) : state.status === "broken" ? (
            <div role="alert" className="space-y-4">
              <h3 className="font-serif font-bold text-xl text-forest">This link does not open a recipe</h3>
              <p className="text-xs text-forest/70">It may have been cut off when it was copied. Ask for the link again, or look at the example meals.</p>
              <button onClick={() => router.push("/demo")} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-6 py-3 rounded-full transition-all">
                See example meals
              </button>
            </div>
          ) : (
            <div role="alert" className="space-y-4">
              <h3 className="font-serif font-bold text-xl text-forest">{state.title ? `"${state.title}" did not open` : "The recipe did not open"}</h3>
              <p className="text-xs text-forest/70">{state.message}</p>
              <button onClick={open} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-6 py-3 rounded-full transition-all">
                Try again
              </button>
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
