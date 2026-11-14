// My Day (2026-11-14): one day of meals against daily targets, on the running dev server (3100). No model, no engine
// call for the day itself.
// 1. Real app: the picker (slot category first), servings in 0.5 steps, a food typed by hand, kept on reload, Clear day.
// 2. No daily targets: totals and a note to the Profile; with targets: what's left, an orange over limit, and
//    "Make a meal for what's left" starts the quiz from what is left (inside the quiz ranges).
// 3. A deleted recipe drops out of the day; storage keeps its slug.
// 4. /demo: the sample day, changes gone on reload, nothing stored.
// 5. Phone: My Day in the menu, no sideways scroll.
import fs from "node:fs";
import { expect, test } from "@playwright/test";

const load = (slug) => {
  const { photo: _p, photo_ai_generated: _a, demo: _d, ...rest } = JSON.parse(fs.readFileSync(`demo/meals/${slug}.json`, "utf8"));
  return { ...rest, slug: `my-${slug}` };
};
const OATS = load("carrot-cake-overnight-oats-with-berries");
const TUNA = load("tuna-frittata-with-vegetables");
const MEALS = { [OATS.slug]: OATS, [TUNA.slug]: TUNA };
const per = (doc) => doc.evaluation.macros.per_serving;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ meals }) => {
    if (sessionStorage.getItem("seeded")) return; // seed once per test, so changes survive reloads
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("smartbite.meals", JSON.stringify(meals));
    localStorage.setItem("smartbite.saved", JSON.stringify(Object.keys(meals)));
    localStorage.setItem("smartbite.anthropicKey", JSON.stringify("sk-ant-e2e-fake-key-0000"));
    localStorage.setItem("smartbite.setup", JSON.stringify("done"));
  }, { meals: MEALS });
});

const slot = (page, id) => page.locator(`#day-slot-${id}`);
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("smartbite.day") || "null"));

async function addRecipe(page, slotLabel, name) {
  await page.getByRole("button", { name: `Add to ${slotLabel}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: new RegExp(name) }).click();
  await expect(dialog).toHaveCount(0);
}

test("real app: picker, servings, your own food, kept on reload, Clear day", async ({ page }) => {
  await page.goto("/?tab=my-day");
  await expect(page.locator("#tab-my-day h1")).toHaveText("My Day");
  expect(await stored(page)).toBeNull(); // nothing written on load

  // Breakfast lists the breakfast recipe first; the search finds by ingredient
  await page.getByRole("button", { name: "Add to Breakfast" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#day-picker-list li").first()).toContainText("Carrot cake overnight oats");
  await expect(dialog.locator("img")).toHaveCount(0);
  await dialog.getByLabel("Search your recipes").fill("tuna");
  await expect(dialog.locator("#day-picker-list li")).toHaveCount(1);
  await dialog.getByLabel("Search your recipes").fill("");
  await dialog.getByRole("button", { name: /Carrot cake overnight oats/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add to Breakfast" })).toBeFocused(); // focus goes back

  // Servings in 0.5 steps, never under 0.5
  const oats = slot(page, "breakfast");
  await oats.getByRole("button", { name: /^More servings of/ }).click();
  await expect(oats.locator(".day-servings")).toHaveText("1.5 servings");
  await oats.getByRole("button", { name: /^Fewer servings of/ }).click();
  await oats.getByRole("button", { name: /^Fewer servings of/ }).click();
  await expect(oats.locator(".day-servings")).toHaveText("0.5 servings");
  await expect(oats.getByRole("button", { name: /^Fewer servings of/ })).toBeDisabled();

  // A food typed by hand: name and kcal needed, the rest optional
  await page.getByRole("button", { name: "Add to Snack" }).click();
  await dialog.getByRole("tab", { name: "Add your own" }).click();
  await dialog.getByRole("button", { name: "Add to Snack" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByLabel("Name").fill("Banana");
  await dialog.getByLabel("Calories (kcal)").fill("105");
  await dialog.getByLabel("Protein (g)").fill("1,3");
  await dialog.getByRole("button", { name: "Add to Snack" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(slot(page, "snack")).toContainText("Banana");
  await expect(slot(page, "snack").locator(".day-subtotal")).toHaveText("105 kcal · 1g protein");

  const kcal = String(Math.round(per(OATS).kcal * 0.5 + 105));
  await expect(page.locator("#day-total-kcal")).toContainText(kcal);
  await expect(page.locator("#day-not-counted")).toContainText("Banana");

  // Kept in this browser
  await page.reload();
  await expect(slot(page, "breakfast").locator(".day-servings")).toHaveText("0.5 servings");
  await expect(slot(page, "snack")).toContainText("Banana");

  // Remove one item, then Clear day asks once more
  await slot(page, "snack").getByRole("button", { name: "Remove Banana from Snack" }).click();
  await expect(slot(page, "snack").locator(".day-item")).toHaveCount(0);
  await page.locator("#day-clear").click();
  await expect(page.locator("#day-clear")).toHaveText("Tap again to clear the day");
  await expect(page.locator(".day-item")).toHaveCount(1);
  await page.locator("#day-clear").click();
  await expect(page.locator(".day-item")).toHaveCount(0);
  expect(await stored(page)).toBeNull();
});

test("targets: a note without them; with them what's left, an orange over limit, and a meal for what's left", async ({ page }) => {
  await page.goto("/?tab=my-day");
  await expect(page.locator("#day-targets-note")).toContainText("Set your daily targets in your Profile");
  await expect(page.locator("#day-targets-note a")).toHaveAttribute("href", /^\/profile/);
  await expect(page.locator("#day-make-meal")).toHaveCount(0); // no targets: no invented defaults
  await addRecipe(page, "Dinner", "Tuna frittata with vegetables");

  await page.goto("/profile");
  await page.locator("#field-daily_kcal_target").fill("2000");
  await page.locator("#field-daily_protein_g_target").fill("150");
  await page.locator("#field-daily_carbs_g_max").fill("200");
  await page.locator("#field-daily_fat_g_max").fill("10"); // below the frittata's fat
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByText("Profile saved in this browser.")).toBeVisible();

  await page.goto("/?tab=my-day");
  await expect(page.locator("#day-targets-note")).toHaveCount(0);
  const t = per(TUNA);
  await expect(page.locator("#day-total-kcal .day-status")).toHaveText(`${Math.round(2000 - t.kcal)} kcal left`);
  const fat = page.locator("#day-total-fat_g .day-status");
  await expect(fat).toHaveText(`${Math.round(t.fat_g - 10)} g over`);
  await expect(fat).toHaveClass(/text-amber-700/); // an over limit is orange
  await expect(page.locator("#day-total-carbs_g .day-status")).not.toHaveClass(/text-amber/);

  // What's left goes to the quiz, inside its ranges (kcal 200-1200 in 10s, protein at most kcal / 4)
  await page.locator("#day-make-meal").click();
  await expect(page).toHaveURL(/tab=make-meal/);
  const kcal = Math.min(1200, Math.max(200, Math.round((2000 - t.kcal) / 10) * 10));
  const protein = Math.min(Math.floor(kcal / 4), 120, Math.max(10, Math.round(150 - t.protein_g)));
  const heading = page.locator("#make-step-1 h2", { hasText: "How big should it be?" });
  await page.locator("#input-craving").fill("chicken");
  for (let i = 0; i < 5 && !(await heading.isVisible()); i++) await page.getByRole("button", { name: /^Continue/ }).click();
  await expect(page.locator("#input-calories")).toHaveValue(String(kcal));
  await expect(page.locator("#input-protein")).toHaveValue(String(protein));
});

test("a deleted recipe drops out of the day; storage keeps it", async ({ page }) => {
  await page.goto("/?tab=my-day");
  await addRecipe(page, "Dinner", "Tuna frittata with vegetables");
  await expect(slot(page, "dinner").locator(".day-item")).toHaveCount(1);

  await page.locator("#nav-recipes").click();
  const card = page.locator("#recipes-grid > div", { hasText: "Tuna frittata with vegetables" });
  await card.getByRole("button", { name: /Options for/ }).click();
  await page.getByRole("menuitem", { name: "Delete meal" }).click();
  await page.getByRole("menuitem", { name: "Tap again to delete" }).click();
  await expect(card).toHaveCount(0);

  await page.locator("#nav-my-day").click();
  await expect(slot(page, "dinner").locator(".day-item")).toHaveCount(0);
  await expect(slot(page, "dinner").locator(".day-subtotal")).toHaveText("0 kcal · 0g protein");
  expect((await stored(page)).slots.dinner.map((i) => i.slug)).toEqual([TUNA.slug]);
});

test("demo: the sample day shows, changes are gone on reload, nothing is stored", async ({ page }) => {
  await page.goto("/demo?tab=my-day");
  await expect(page.locator(".day-item")).toHaveCount(4);
  await expect(slot(page, "snack")).toContainText("Banana");
  await expect(page.locator("#day-total-kcal .day-status")).toHaveText("442 kcal left");
  await expect(page.locator("#tab-my-day img")).toHaveCount(0);
  await slot(page, "snack").getByRole("button", { name: "Remove Banana from Snack" }).click();
  await expect(page.locator(".day-item")).toHaveCount(3);
  expect(await stored(page)).toBeNull();
  await page.reload();
  await expect(page.locator(".day-item")).toHaveCount(4);
  expect(await stored(page)).toBeNull();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("My Day is in the phone menu and fits the screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "My Day" }).click();
    await expect(page).toHaveURL(/\?tab=my-day$/);
    await expect(page.locator("#tab-my-day")).toBeVisible();
    await addRecipe(page, "Lunch", "Tuna frittata with vegetables");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Add to Snack" }).click();
    await page.getByRole("tab", { name: "Add your own" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

test("a meal for what's left starts the quiz over when it already shows ideas", async ({ page }) => {
  await page.goto("/demo?tab=make-meal");
  await page.locator("#input-craving").fill("tuna frittata");
  const show = page.getByRole("button", { name: "Show me 4 ideas" });
  for (let i = 0; i < 10 && !(await show.isVisible()); i++) await page.getByRole("button", { name: /^(Continue|Back to summary)/ }).click();
  await show.click();
  await expect(page.locator("#ideas-card-grid > div")).toHaveCount(4);

  // The sample day is 1558 kcal of 2000: 442 left, so the quiz starts at 440
  await page.locator("#nav-my-day").click();
  await page.locator("#day-make-meal").click();
  await expect(page.locator("#ideas-card-grid")).toBeHidden();
  // The answers stay, so the quiz opens on its summary; the size question shows the new start
  await expect(page.locator("#make-step-1 h2", { hasText: "Check your answers" })).toBeVisible();
  await page.getByRole("button", { name: "Change How big should it be?" }).click();
  await expect(page.locator("#input-calories")).toHaveValue("440");
  await expect(page.getByText("From what is left in My Day.")).toBeVisible();
});
