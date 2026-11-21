// My Day food picker (2026-11-21), on the running dev server: no engine and no model call (all in the browser).
// 1. Spanish search, keyboard pick, grams, the preview, and the day totals, fiber and vitamins change by the engine's
//    numbers (% of the EU reference value, smartbite_engine/nutrition.py MICROS).
// 2. Eggs: how many and the size (S 42, M 51, L 60, XL 69 g each).
// 3. A saved product with a label: listed first, its label values, fiber from the food table.
// 4. Phone: the Foods tab fits 390 px.
import fs from "node:fs";
import { expect, test } from "@playwright/test";

const TABLE = JSON.parse(fs.readFileSync(new URL("../../data/open/nutrition/per-100g.json", import.meta.url), "utf8")).foods;
// The engine's math (value per 100 g x grams / 100), rounded like My Day keeps an item: kcal whole, grams to 0.1
const amount = (p100, grams) => {
  const f = grams / 100;
  return { kcal: Math.round(p100.kcal * f), protein_g: Math.round(p100.protein_g * f * 10) / 10,
    fiber_g: p100.fiber_g == null ? null : Math.round(p100.fiber_g * f * 10) / 10 };
};

// % of the daily value of one food, as the engine's micros_block for that food alone
const pct = (p100, key, grams, reference) => Math.floor(((p100[key] * grams) / 100 / reference) * 100 + 0.5);

const OATS_LABEL = { kcal: 372, protein_g: 13.5, carbs_g: 58.7, fat_g: 7 }; // no fiber on the label
const PRODUCTS = { "none|rolled oats": { food: "rolled oats", name: "Copos de avena integral", sold_by: "pack", pack_grams: 500,
  per_100g: OATS_LABEL } };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ products }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("smartbite.anthropicKey", JSON.stringify("sk-ant-e2e-fake-key-0000"));
    localStorage.setItem("smartbite.setup", JSON.stringify("done"));
    localStorage.setItem("smartbite.products", JSON.stringify(products));
  }, { products: PRODUCTS });
  // Nothing here may call the engine or a model
  await page.route("**/api/**", (route) => route.abort());
});

const slot = (page, id) => page.locator(`#day-slot-${id}`);
const totalKcal = async (page) => Number(await page.locator("#day-total-kcal .font-serif").innerText());
const fiberRow = (page) => page.locator("#day-micros-list li", { hasText: "Fiber" });

async function openFoods(page, slotLabel) {
  await page.getByRole("button", { name: `Add to ${slotLabel}` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Foods" }).click();
  await expect(dialog.locator("#day-food-list li").first()).toBeVisible(); // the food list loaded
  return dialog;
}

test("Spanish search, keyboard pick, grams: the day goes up by the engine's numbers", async ({ page }) => {
  await page.goto("/?tab=my-day");
  expect(await totalKcal(page)).toBe(0);
  const dialog = await openFoods(page, "Lunch");

  const search = dialog.getByLabel("Search foods");
  await search.fill("guisantes");
  const results = dialog.locator("#day-food-list li");
  await expect(results).toHaveCount(1);
  const peas = TABLE["frozen peas"];
  await expect(results.first()).toContainText("Frozen peas");
  await expect(results.first()).toContainText("guisantes");
  await expect(results.first()).toContainText(`Per 100 g: ${Math.round(peas.kcal)} kcal`);

  // Keyboard: down to the result, Enter picks it, focus goes to the grams
  await search.press("ArrowDown");
  await expect(results.first().getByRole("button")).toBeFocused();
  await page.keyboard.press("Enter");
  const grams = dialog.getByLabel("Grams");
  await expect(grams).toBeFocused();
  await expect(dialog.locator("#day-food-preview")).toContainText("Type the grams");
  await dialog.getByRole("button", { name: "Add to Lunch" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Type the grams.");

  await grams.fill("150");
  const want = amount(peas, 150);
  await expect(dialog.locator("#day-food-kcal")).toContainText(String(want.kcal));
  await expect(dialog.locator("#day-food-protein_g")).toContainText(String(want.protein_g));
  await expect(dialog.locator("#day-food-fiber_g")).toContainText(String(want.fiber_g));
  await dialog.getByRole("button", { name: "Add to Lunch" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to Lunch" })).toBeFocused();

  const row = slot(page, "lunch").locator(".day-item");
  await expect(row).toContainText("Frozen peas (150 g)");
  await expect(row).toContainText(`${want.kcal} kcal · ${Math.round(want.protein_g)}g protein`);
  await expect(row).not.toContainText("your own");
  expect(await totalKcal(page)).toBe(want.kcal);
  await expect(fiberRow(page)).toContainText(`${Math.round(want.fiber_g)} g`);
  // Vitamins and minerals count too; the food is not listed as having no vitamin data
  const micro = (label) => page.locator("#day-micros-list li", { hasText: new RegExp(`^${label}`) });
  await expect(micro("Iron")).toContainText(`${pct(peas, "iron_mg", 150, 14)}%`);
  await expect(micro("Vitamin C")).toContainText(`${pct(peas, "vitamin_c_mg", 150, 80)}%`);
  await expect(micro("Folate")).toContainText(`${pct(peas, "folate_ug", 150, 200)}%`);
  await expect(page.locator("#day-not-counted")).toHaveCount(0);

  // Stored with its fiber, kept on reload
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("smartbite.day")));
  expect(stored.slots.lunch[0]).toMatchObject({ kind: "extra", name: "Frozen peas (150 g)", kcal: want.kcal, fiber_g: want.fiber_g,
    source: "food" });
  await page.reload();
  expect(await totalKcal(page)).toBe(want.kcal);
});

test("eggs: how many and the size", async ({ page }) => {
  await page.goto("/?tab=my-day");
  const dialog = await openFoods(page, "Breakfast");
  await dialog.getByLabel("Search foods").fill("huevos");
  await dialog.locator("#day-food-list li").first().getByRole("button").click();
  await expect(dialog.locator("#day-food-picked")).toHaveText("Eggs");
  await expect(dialog.getByLabel("Egg size")).toHaveValue("M");
  await dialog.getByLabel("Eggs", { exact: true }).fill("2");
  await expect(dialog.locator("#day-food-preview")).toContainText("2 eggs, size M (102 g)");
  await dialog.getByLabel("Egg size").selectOption("L");
  await expect(dialog.locator("#day-food-preview")).toContainText("2 eggs, size L (120 g)");
  const want = amount(TABLE.eggs, 120);
  await expect(dialog.locator("#day-food-kcal")).toContainText(String(want.kcal));
  await dialog.getByLabel("Eggs", { exact: true }).fill("1.5");
  await dialog.getByRole("button", { name: "Add to Breakfast" }).click();
  await expect(dialog.getByRole("alert")).toContainText("whole number");
  await dialog.getByLabel("Eggs", { exact: true }).fill("2");
  await dialog.getByRole("button", { name: "Add to Breakfast" }).click();
  await expect(slot(page, "breakfast").locator(".day-item")).toContainText("Eggs (2 eggs, size L)");
  expect(await totalKcal(page)).toBe(want.kcal);
});

test("a saved product with a label: first, its label values, fiber from the food table", async ({ page }) => {
  await page.goto("/?tab=my-day");
  const dialog = await openFoods(page, "Breakfast");
  await dialog.getByLabel("Search foods").fill("avena");
  const results = dialog.locator("#day-food-list li");
  await expect(results).toHaveCount(2);
  await expect(results.first()).toContainText("Your product");
  await expect(results.first()).toContainText("Copos de avena integral");
  await expect(results.first()).toContainText("Per 100 g: 372 kcal · 13.5g protein · 58.7g carbs · 7g fat");
  await expect(results.nth(1)).toContainText("Rolled oats");

  // "Change food" goes back to the search with the words kept
  await results.first().getByRole("button").click();
  await dialog.getByRole("button", { name: "Change food" }).click();
  await expect(dialog.getByLabel("Search foods")).toHaveValue("avena");
  await expect(dialog.getByLabel("Search foods")).toBeFocused();
  await results.first().getByRole("button").click();

  await dialog.getByLabel("Grams").fill("60");
  const want = amount({ ...OATS_LABEL, fiber_g: TABLE["rolled oats"].fiber_g }, 60);
  await expect(dialog.locator("#day-food-kcal")).toContainText(String(want.kcal));
  await expect(dialog.locator("#day-food-fiber_g")).toContainText(String(want.fiber_g));
  await dialog.getByRole("button", { name: "Add to Breakfast" }).click();
  await expect(slot(page, "breakfast").locator(".day-item")).toContainText("Copos de avena integral (60 g)");
  expect(await totalKcal(page)).toBe(want.kcal);
  await expect(fiberRow(page)).toContainText(`${Math.round(want.fiber_g)} g`);
  // The label has no minerals: they come from the rolled oats table record
  await expect(page.locator("#day-micros-list li", { hasText: /^Magnesium/ }))
    .toContainText(`${pct(TABLE["rolled oats"], "magnesium_mg", 60, 375)}%`);
});

test("demo: the food list works and the user's products are not read", async ({ page }) => {
  await page.goto("/demo?tab=my-day");
  const before = await totalKcal(page);
  const dialog = await openFoods(page, "Snack");
  await dialog.getByLabel("Search foods").fill("avena");
  await expect(dialog.locator("#day-food-list li")).toHaveCount(1);
  await expect(dialog.locator("#day-food-list")).not.toContainText("Your product");
  await dialog.getByLabel("Search foods").fill("platano");
  await dialog.getByLabel("Search foods").press("Enter");
  await dialog.getByLabel("Grams").fill("120");
  await dialog.getByRole("button", { name: "Add to Snack" }).click();
  expect(await totalKcal(page)).toBe(before + amount(TABLE.banana, 120).kcal);
  expect(await page.evaluate(() => localStorage.getItem("smartbite.day"))).toBeNull();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the Foods tab fits 390 px with big enough tap targets", async ({ page }) => {
    await page.goto("/?tab=my-day");
    const dialog = await openFoods(page, "Snack");
    await dialog.getByLabel("Search foods").fill("pollo");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const box = await dialog.locator("#day-food-list li button").first().boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await dialog.locator("#day-food-list li button").first().click();
    await dialog.getByLabel("Grams").fill("125");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const dialogWidth = await dialog.evaluate((d) => d.scrollWidth - d.clientWidth);
    expect(dialogWidth).toBe(0);
  });
});
