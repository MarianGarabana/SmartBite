// My Recipes: no image without a photo, and Edit / Delete for meals made in this browser (decided 2026-11-09). Runs on
// the dev server (3100) with the real engine (8100). The model is mocked (route interception): no real key, no cost.
// 1. A meal with no photo shows no image on its card or recipe page; the kcal shows as a pill.
// 2. Card menu -> Edit: changing grams recomputes macros with the real engine; a rename alone keeps the macros.
// 3. Card menu -> Delete asks once more, then the meal is gone.
// 4. "Change with AI" sends the user's change on the idea and saves the rewritten recipe.
import fs from "node:fs";
import { expect, test } from "@playwright/test";

const SLUG = "my-tuna-frittata";
const demo = JSON.parse(fs.readFileSync("demo/meals/tuna-frittata-with-vegetables.json", "utf8"));
const { photo: _p, photo_ai_generated: _a, demo: _d, ...rest } = demo;
const DOC = { ...rest, slug: SLUG };
const FAKE_KEY = "sk-ant-e2e-fake-key-0000";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ slug, doc, key }) => {
    if (sessionStorage.getItem("seeded")) return; // seed once per test, so edits survive reloads
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("smartbite.meals", JSON.stringify({ [slug]: doc }));
    localStorage.setItem("smartbite.saved", JSON.stringify([slug]));
    localStorage.setItem("smartbite.anthropicKey", JSON.stringify(key));
    localStorage.setItem("smartbite.setup", JSON.stringify("done"));
  }, { slug: SLUG, doc: DOC, key: FAKE_KEY });
});

const card = (page) => page.locator("#recipes-grid > div", { hasText: "Tuna frittata with vegetables" });

test("a meal with no photo shows no image, on its card and its recipe page", async ({ page }) => {
  await page.goto("/?tab=recipes");
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator("img")).toHaveCount(0);
  await expect(card(page).getByText("510 kcal")).toBeVisible();
  await page.goto(`/recipes/${SLUG}`);
  await expect(page.locator("#picked-meal-title")).toHaveText("Tuna frittata with vegetables");
  await expect(page.locator("#recipe-page img")).toHaveCount(0);
});

test("edit from the card menu: grams recompute macros; a rename alone keeps the macros", async ({ page }) => {
  const evaluations = [];
  page.on("request", (r) => { if (r.url().includes("/api/evaluate") && r.method() === "POST") evaluations.push(r.url()); });
  await page.goto("/?tab=recipes");
  await card(page).getByRole("button", { name: /Options for/ }).click();
  await page.getByRole("menuitem", { name: "Edit meal" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Edit meal");
  await expect(page.locator("#tile-protein")).toHaveText("49g");

  // More tuna: the real engine recomputes the macros
  await dialog.getByLabel("canned tuna in water grams per serving").fill("150");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Meal saved. Macros, packs and cost are updated.")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#tile-protein")).not.toHaveText("49g");
  const protein = Number((await page.locator("#tile-protein").textContent()).replace("g", ""));
  expect(protein).toBeGreaterThan(65); // about 25 g of protein per 100 g of tuna
  expect(evaluations.length).toBeGreaterThan(0);

  // Rename and a new step: saved as text; the macros stay (the page itself re-checks prices after any change)
  await page.locator("#edit-meal").click();
  await dialog.locator("#edit-title").fill("Big tuna frittata");
  await dialog.locator("#edit-steps").fill("Whisk the eggs.\nBake 20 minutes.");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  await expect(page.locator("#picked-meal-title")).toHaveText("Big tuna frittata");
  await expect(page.locator("#picked-steps-list li")).toHaveText(["Whisk the eggs.", "Bake 20 minutes."]);
  await expect(page.locator("#tile-protein")).toHaveText(`${protein}g`);
  await page.reload();
  await expect(page.locator("#picked-meal-title")).toHaveText("Big tuna frittata"); // kept in this browser
});

test("delete from the card menu asks once more, then the meal is gone", async ({ page }) => {
  await page.goto("/?tab=recipes");
  await card(page).getByRole("button", { name: /Options for/ }).click();
  await page.getByRole("menuitem", { name: "Delete meal" }).click();
  await expect(page.getByRole("menuitem", { name: "Tap again to delete" })).toBeVisible();
  await expect(card(page)).toBeVisible();
  await page.getByRole("menuitem", { name: "Tap again to delete" }).click();
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("smartbite.meals") || "{}")))).toEqual([]);
});

test("change with AI: the change goes on the idea, and the rewritten recipe is saved", async ({ page }) => {
  const calls = [];
  const rewritten = { ...DOC.recipe, idea_id: "1", title: "Tuna and spinach frittata",
    ingredients: [...DOC.recipe.ingredients, { name: "spinach", grams_per_serving: 60, units_per_serving: 0, storage: "fresh",
      pantry: false, dry: false, leftover_plan: "use_in_another_meal" }] };
  await page.route("https://api.anthropic.com/v1/messages", async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = req.postDataJSON();
    calls.push(String(body.messages?.[0]?.content ?? ""));
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({
      id: `msg_e2e_${calls.length}`, type: "message", role: "assistant", model: body.model,
      content: [{ type: "text", text: JSON.stringify(rewritten) }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) });
  });
  await page.goto(`/recipes/${SLUG}?edit=1`);
  const dialog = page.getByRole("dialog");
  await dialog.locator("#edit-ask").fill("add spinach");
  await dialog.getByRole("button", { name: "Change with AI" }).click();
  await expect(page.getByText("Meal changed. Macros, packs and cost are updated.")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("#picked-meal-title")).toHaveText("Tuna and spinach frittata");
  await expect(page.locator("#picked-ingredients-list")).toContainText("spinach");
  expect(calls.length).toBeGreaterThan(0);
  expect(calls[0]).toContain("add spinach"); // the change rides on the idea in the recipe prompt
  await expect(page).toHaveURL(new RegExp(`/recipes/${SLUG}$`)); // same address, no ?edit
});
