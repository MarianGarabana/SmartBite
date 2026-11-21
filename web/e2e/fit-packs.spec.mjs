// Fit to packs (decided 2026-11-20) on the dev server (3100) with the real engine (8100). No model runs.
// 1. My Recipes shows "Fit to packs" only on a card whose meal code can improve; the frittata's packs already fit.
// 2. From the card: the recipe page opens with the preview; Apply changes the saved meal (servings, grams) and the
//    engine works out packs and macros again; Undo brings back the saved meal exactly.
import fs from "node:fs";
import { expect, test } from "@playwright/test";

const local = (file, slug) => {
  const demo = JSON.parse(fs.readFileSync(`demo/meals/${file}.json`, "utf8"));
  const { photo: _p, photo_ai_generated: _a, demo: _d, ...rest } = demo;
  return { ...rest, slug };
};
const SALAD = "my-tuna-chickpea-salad";
const FRITTATA = "my-tuna-frittata";
const DOCS = { [SALAD]: local("tuna-and-chickpea-salad-with-skyr-dressing", SALAD),
  [FRITTATA]: local("tuna-frittata-with-vegetables", FRITTATA) };

test.beforeEach(async ({ page }) => {
  await page.addInitScript((docs) => {
    if (sessionStorage.getItem("seeded")) return; // seed once per test, so changes survive reloads
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("smartbite.meals", JSON.stringify(docs));
    localStorage.setItem("smartbite.saved", JSON.stringify(Object.keys(docs)));
  }, DOCS);
});

const stored = (page, slug) => page.evaluate((s) => JSON.parse(localStorage.getItem("smartbite.meals"))[s], slug);
const card = (page, name) => page.locator("#recipes-grid > div", { hasText: name });

test("the button shows only on a card whose packs can fit better", async ({ page }) => {
  await page.goto("/?tab=recipes");
  await expect(card(page, "Tuna frittata with vegetables")).toBeVisible();
  await expect(card(page, "Tuna and chickpea salad").getByRole("link", { name: /Fit .* to packs/ })).toBeVisible();
  await expect(card(page, "Tuna frittata with vegetables").getByRole("link", { name: /Fit .* to packs/ })).toHaveCount(0);
});

test("Apply changes the saved meal and the engine recomputes it; Undo brings it back exactly", async ({ page }) => {
  const before = DOCS[SALAD];
  await page.goto("/?tab=recipes");
  await card(page, "Tuna and chickpea salad").getByRole("link", { name: /Fit .* to packs/ }).click();
  await expect(page).toHaveURL(new RegExp(`/recipes/${SALAD}\\?fit=1$`));
  const panel = page.locator("#fit-packs-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("protein stays on target");
  await expect(panel.getByRole("checkbox").first()).toBeChecked();

  const engine = [];
  page.on("response", (r) => { if (r.url().endsWith("/api/evaluate") && r.request().method() === "POST") engine.push(r); });
  await page.locator("#fit-packs-apply").click();
  await expect(page.getByText("Meal fitted to packs.")).toBeVisible();
  await expect(page.locator("#fit-packs-undo")).toBeVisible();

  const after = await stored(page, SALAD);
  expect(after.before_fit.recipe).toEqual(before.recipe);
  expect(after.recipe.servings).not.toBe(before.recipe.servings); // whole cans: 5 servings instead of 2
  expect(after.form.servings).toBe(after.recipe.servings);
  await expect(page.locator("#servings-count")).toHaveText(String(after.recipe.servings));
  const tunaOf = (doc) => doc.recipe.ingredients.find((i) => /tuna/i.test(i.name)).grams_per_serving;
  expect(tunaOf(after)).not.toBe(tunaOf(before));
  // the engine ran the fitted recipe: the stored macros and packs are its reply, not the old ones
  expect(engine.some((r) => r.status() === 200)).toBe(true);
  expect(after.evaluation.macros.per_serving).not.toEqual(before.evaluation.macros.per_serving);
  // the list shows grams for all servings
  await expect(page.locator("#picked-ingredients-list")).toContainText(`${tunaOf(after) * after.recipe.servings}g`);

  await page.locator("#fit-packs-undo").click();
  await expect(page.getByText("Back to the meal as it was before fitting.")).toBeVisible();
  expect(await stored(page, SALAD)).toEqual(before);
  await expect(page.locator("#fit-packs-undo")).toHaveCount(0);
  await expect(page.locator("#servings-count")).toHaveText(String(before.form.servings));
});

test("demo meals have no Fit to packs", async ({ page }) => {
  await page.goto("/recipes/tuna-and-chickpea-salad-with-skyr-dressing");
  await expect(page.locator("#picked-meal-title")).toBeVisible();
  await expect(page.locator("#fit-packs")).toHaveCount(0);
});
