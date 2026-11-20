// Free trial (decided 2026-11-20) on the running dev server (3100), with the real engine behind /api/evaluate.
// /api/trial is mocked with route interception (no trial key, no model): the tests check what the browser sends,
// the counting in this browser, and where the page leads when the free meals are over.
// 1. /start offers "Try 3 free meals" only when the server says the trial is on.
// 2. A free meal: ideas and recipe go to /api/trial as structured inputs (never prompt text), the rerun carries the
//    engine's facts, no call goes to a model host, and the meal counts once its recipe is written.
// 3. With the 3 meals used, Make Your Meal and /start say so and lead to the own-key setup (no redirect, so the last
//    meal's page is never cut off).
// 4. The server says the free meals ran out: the ideas step offers the own-key setup.
// 5. Headings use the design's Playfair Display (the 16.4.3 build lost it on the live site, fixed 2026-11-20).
import { expect, test } from "@playwright/test";

const MACROS = { kcal: 450, protein_g: 45, carbs_g: 40, fat_g: 12 };
const idea = (n, name, main) => ({
  idea_id: String(n), name, one_line: `${name}, made for the e2e test.`, main_ingredients: main,
  rough_macros: MACROS, image_prompt: `overhead photo of ${name.toLowerCase()}`,
});
const IDEAS = { ideas: [
  idea(1, "Greek chicken bowl", ["chicken breast", "rice", "cucumber"]),
  idea(2, "Tuna chickpea salad", ["canned tuna in water", "canned chickpeas", "tomato"]),
  idea(3, "Turkey sweet potato bowl", ["turkey tenderloin", "sweet potato", "spinach"]),
  idea(4, "Lentil and egg stew", ["eggs", "tomato", "onion"]),
] };
// Same recipe and fix as flow.spec.mjs: the engine finds a miss in RECIPE, so the app asks once more
const RECIPE = {
  idea_id: "1", title: "Greek chicken bowl", servings: 1, prep_time_min: 35,
  ingredients: [
    { name: "chicken breast", grams_per_serving: 170, units_per_serving: 0, storage: "fresh", pantry: false, dry: false },
    { name: "rice", grams_per_serving: 70, units_per_serving: 0, storage: "keeps", pantry: false, dry: true, note: "dry weight" },
    { name: "cucumber", grams_per_serving: 120, units_per_serving: 0, storage: "fresh", pantry: false, dry: false },
    { name: "greek yogurt", grams_per_serving: 80, units_per_serving: 0, storage: "fresh", pantry: false, dry: false },
  ],
  steps: ["Cook the rice in salted water.", "Grill the chicken and slice it.", "Dice the cucumber and mix it with the yogurt."],
};
const use = { leftover_plan: "use_in_another_meal" };
const RECIPE_FIXED = { ...RECIPE, ingredients: [
  { ...RECIPE.ingredients[0], grams_per_serving: 145, ...use },
  { ...RECIPE.ingredients[1], grams_per_serving: 60 },
  { ...RECIPE.ingredients[2], ...use },
  { ...RECIPE.ingredients[3], ...use },
] };
const MODEL_HOSTS = /^https:\/\/(api\.anthropic\.com|api\.openai\.com|openrouter\.ai|generativelanguage\.googleapis\.com)\//;

async function askForIdeas(page, craving) {
  await page.locator("#input-craving").fill(craving);
  const show = page.getByRole("button", { name: "Show me 4 ideas" });
  for (let i = 0; i < 10 && !(await show.isVisible()); i++) await page.getByRole("button", { name: /^(Continue|Back to summary)/ }).click();
  await show.click();
}

// GET says whether the trial is on; POST answers each step like the server would (or with `fail`)
async function mockTrial(page, { available = true, fail = null } = {}) {
  const calls = [];
  await page.route("**/api/trial", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({ json: { available, meals: 3, model: "claude-haiku-5-5" } });
    }
    const body = req.postDataJSON();
    calls.push(body);
    if (fail) return route.fulfill({ status: 503, json: { errors: [fail.message], code: fail.code } });
    const data = body.step === "ideas" ? IDEAS : body.rerun ? RECIPE_FIXED : RECIPE;
    return route.fulfill({ json: { data } });
  });
  await page.route(MODEL_HOSTS, (route) => {
    calls.push({ step: "unexpected", url: route.request().url() });
    return route.abort();
  });
  return calls;
}

const trialState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("smartbite.trial") || "null"));

test("no trial card when the server has no trial key", async ({ page }) => {
  await mockTrial(page, { available: false });
  await page.goto("/start");
  await expect(page.locator("#start-page h1")).toHaveText("Start SmartBite");
  await expect(page.locator("#start-key")).toBeVisible();
  await expect(page.locator("#start-trial")).toHaveCount(0);
  await expect(page.getByText("Three ways in")).toBeVisible();
});

test("a free meal: structured inputs to /api/trial, no model host, counted once the recipe is written", async ({ page }) => {
  const calls = await mockTrial(page);
  await page.goto("/start");
  const card = page.locator("#start-trial");
  await expect(card).toContainText("Try 3 free meals");
  await expect(page.getByText("Four ways in")).toBeVisible();
  await card.getByRole("button", { name: "Make a free meal" }).click();
  await expect(page).toHaveURL(/\/\?tab=make-meal$/);
  await expect(page.locator("#trial-make-bar")).toContainText("Free meal 1 of 3.");

  await askForIdeas(page, "chicken bowl with rice and cucumber");
  const cards = page.locator("#ideas-card-grid > div");
  await expect(cards).toHaveCount(4);
  expect(calls[0].step).toBe("ideas");
  expect(Object.keys(calls[0]).sort()).toEqual(["form", "profile", "seed", "step"]);
  expect(calls[0].form.craving).toBe("chicken bowl with rice and cucumber");
  expect((await trialState(page)).meals).toBe(0); // ideas alone are not a meal
  expect((await trialState(page)).ideas).toBe(1);

  await cards.first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Select meal" }).click();
  await page.waitForURL(/\/recipes\/greek-chicken-bowl-[a-z0-9]+$/);

  const steps = calls.map((c) => c.step);
  expect(steps).toEqual(["ideas", "recipe", "recipe"]); // the first recipe and one rerun
  expect(calls[1].rerun ?? null).toBeNull();
  expect(calls[2].rerun.attempt).toBe(2);
  expect(calls[2].rerun.misses.length).toBeGreaterThan(0); // the engine's facts, sent back for the server's prompt
  for (const c of calls) {
    expect(Object.keys(c)).not.toContain("system");
    expect(JSON.stringify(c)).not.toContain("KNOWN INGREDIENTS"); // no prompt text leaves the browser
  }
  expect((await trialState(page)).meals).toBe(1);

  await page.goto("/?tab=make-meal");
  await expect(page.locator("#trial-make-bar")).toContainText("Free meal 2 of 3.");
});

test("with the 3 free meals used, Make Your Meal and /start say so", async ({ page }) => {
  await mockTrial(page);
  await page.goto("/start");
  await page.evaluate(() => localStorage.setItem("smartbite.trial", JSON.stringify({ on: true, meals: 3, ideas: 4 })));
  await page.goto("/?tab=make-meal");
  await expect(page.locator("#trial-done")).toContainText("You have made your 3 free meals.");
  await expect(page.locator("#trial-done").getByRole("link", { name: "Use my API key" })).toHaveAttribute("href", "/start");
  await expect(page.locator("#input-craving")).toBeHidden();
  await page.goto("/start");
  await expect(page.locator("#start-trial")).toContainText("You have made your 3 free meals.");
  await expect(page.locator("#start-trial-go")).toHaveCount(0);
});

test("when the trial balance runs out, the ideas step offers the own-key setup", async ({ page }) => {
  await mockTrial(page, { fail: { code: "trial_used_up", message: "The free meals have run out for now. Add your own AI key to keep making meals." } });
  await page.goto("/start");
  await page.locator("#start-trial-go").click();
  await askForIdeas(page, "lentil stew");
  await expect(page.locator("#step-2-loading").getByText("The free meals have run out for now.")).toBeVisible();
  await expect(page.locator("#ideas-own-key")).toHaveAttribute("href", "/start");
  await expect(page.locator("#ideas-retry")).toHaveCount(0);
});

test("headings use Playfair Display", async ({ page }) => {
  await page.goto("/start");
  const font = await page.locator("#start-page h1").evaluate((h) => getComputedStyle(h).fontFamily);
  expect(font).toContain("Playfair Display");
});

test("the last free meal opens its recipe, and then Make Your Meal says the free meals are used", async ({ page }) => {
  await mockTrial(page);
  await page.goto("/start");
  await page.evaluate(() => localStorage.setItem("smartbite.trial", JSON.stringify({ on: true, meals: 2, ideas: 2 })));
  await page.goto("/?tab=make-meal");
  await expect(page.locator("#trial-make-bar")).toContainText("Free meal 3 of 3.");
  await askForIdeas(page, "chicken bowl with rice and cucumber");
  await page.locator("#ideas-card-grid > div").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Select meal" }).click();
  await page.waitForURL(/\/recipes\/greek-chicken-bowl-[a-z0-9]+$/);
  await page.waitForTimeout(1000); // a late redirect would show here
  await expect(page).toHaveURL(/\/recipes\/greek-chicken-bowl-[a-z0-9]+$/);
  expect((await trialState(page)).meals).toBe(3);
  await page.goto("/?tab=make-meal");
  await expect(page.locator("#trial-done")).toBeVisible();
});
