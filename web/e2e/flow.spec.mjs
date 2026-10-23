// Full flow on the running dev server (http://127.0.0.1:3100) with the real engine behind /api/evaluate.
// The Anthropic API is mocked with route interception: the fake key never leaves the browser and no model runs.
import { expect, test } from "@playwright/test";

const FAKE_KEY = "sk-ant-e2e-fake-key-0000";
const DEMO_SLUG = "tuna-frittata-with-vegetables";
const ANTHROPIC = "https://api.anthropic.com/v1/messages";
// Other model endpoints the app can call: any request to them fails the test
const OTHER_LLM_HOSTS = /^https:\/\/(api\.openai\.com|openrouter\.ai|generativelanguage\.googleapis\.com)\//;

const MACROS = { kcal: 450, protein_g: 45, carbs_g: 40, fat_g: 12 };
const idea = (n, name, main) => ({
  idea_id: String(n), name, one_line: `${name}, made for the e2e test.`, main_ingredients: main,
  rough_macros: MACROS, image_prompt: `overhead photo of ${name.toLowerCase()}`,
});
const IDEAS = {
  ideas: [
    idea(1, "Greek chicken bowl", ["chicken breast", "rice", "cucumber"]),
    idea(2, "Tuna chickpea salad", ["canned tuna in water", "canned chickpeas", "tomato"]),
    idea(3, "Turkey sweet potato bowl", ["turkey tenderloin", "sweet potato", "spinach"]),
    idea(4, "Lentil and egg stew", ["eggs", "tomato", "onion"]),
  ],
};
// Recipe for idea 1, one serving (the form default). Foods and grams only: the engine does the math.
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
// The engine finds kcal over target and fresh leftovers in RECIPE, so the app asks once more (the RERUN block). This
// reply cuts the chicken and rice and keeps the leftovers for another meal: no misses, no rerun after it.
const use = { leftover_plan: "use_in_another_meal" };
const RECIPE_FIXED = { ...RECIPE, ingredients: [
  { ...RECIPE.ingredients[0], grams_per_serving: 145, ...use },
  { ...RECIPE.ingredients[1], grams_per_serving: 60 },
  { ...RECIPE.ingredients[2], ...use },
  { ...RECIPE.ingredients[3], ...use },
] };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "POST, OPTIONS",
};

// Answers like the Messages API: ideas run at effort "low", the recipe at "medium"; a recipe prompt with a RERUN
// block is a rerun
async function mockAnthropic(page, calls) {
  await page.route(ANTHROPIC, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = req.postDataJSON();
    const user = String(body.messages?.[0]?.content ?? "");
    const step = body.output_config?.effort !== "medium" ? "ideas" : user.includes("\nRERUN: attempt ") ? "rerun" : "recipe";
    calls.push({ step, key: req.headers()["x-api-key"], model: body.model, user });
    const reply = step === "rerun" ? RECIPE_FIXED : step === "recipe" ? RECIPE : IDEAS;
    return route.fulfill({
      status: 200,
      headers: { ...CORS, "content-type": "application/json" },
      body: JSON.stringify({
        id: `msg_e2e_${calls.length}`, type: "message", role: "assistant", model: body.model,
        content: [{ type: "text", text: JSON.stringify(reply) }],
        stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
      }),
    });
  });
  await page.route(OTHER_LLM_HOSTS, (route) => {
    calls.push({ step: "unexpected", url: route.request().url() });
    return route.abort();
  });
}

test("demo meal page shows the photo and the AI labels", async ({ page }) => {
  await page.goto(`/recipes/${DEMO_SLUG}`);
  await expect(page.locator("#picked-meal-title")).toHaveText("Tuna frittata with vegetables");
  const photo = page.getByAltText("Tuna frittata with vegetables (AI-generated photo)");
  await expect(photo).toBeVisible();
  await expect(photo).toHaveAttribute("src", `/demo/images/${DEMO_SLUG}.jpg`);
  expect(await photo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByText("AI-generated photo", { exact: true })).toBeVisible();
  await expect(page.getByText("AI-generated", { exact: true }).first()).toBeVisible();
  await expect(page.locator("#pack-table-body tr").first()).toBeVisible();
  await expect(page.locator("#picked-steps-list li").first()).toContainText("Heat the oven to 180 degrees");
});

test("each recipe category lists its demo meals", async ({ page }) => {
  await page.goto("/?tab=recipes");
  const cards = page.locator("#tab-recipes a[href^='/recipes/']:visible");
  for (const [name, min] of [["Breakfast", 1], ["Lunch", 10], ["Dinner", 10], ["Salads", 3], ["Warm Meals", 5]]) {
    await page.locator("#recipe-filter-chips").getByRole("button", { name, exact: true }).click();
    expect(await cards.count(), name).toBeGreaterThanOrEqual(min);
  }
});

test("a demo idea shows its meal's own name and macros, in a preview that covers the page", async ({ page }) => {
  await page.goto("/?tab=make-meal");
  await page.locator("#input-craving").fill("lentils");
  await page.getByRole("button", { name: "Show me 4 ideas" }).click();
  const skip = page.getByRole("button", { name: "Skip setup" });
  await skip.or(page.locator("#demo-note")).first().waitFor(); // a fresh browser opens the setup first
  if (await skip.isVisible()) await skip.click();
  await page.locator("#ideas-card-grid h3", { hasText: "Classic lentil stew" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Classic lentil stew with chickpeas and chicken"); // the recipe, not the first idea
  await expect(dialog).toContainText("~50g");
  const top = await dialog.evaluate((d) => d.parentElement.getBoundingClientRect().top);
  expect(top).toBe(0);
});

test("Settings shows the Kitchen Profile and the provider fields", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Kitchen Profile" })).toBeVisible();
  for (const id of ["field-who", "field-kcal_target", "field-protein_g_target", "field-gear", "field-proteins",
    "llm-provider", "llm-model", "api-key"]) {
    await expect(page.locator(`#${id}`), id).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Save provider and key" })).toBeVisible();
});

test("make a meal with a mocked model, the real engine, then cart and Adjust leftovers", async ({ page }) => {
  const calls = [];
  await mockAnthropic(page, calls);
  const consoleText = [];
  page.on("console", (m) => consoleText.push(m.text()));

  // Fake key saved through Settings; it stays in this browser
  await page.goto("/settings");
  await page.locator("#llm-provider").selectOption("anthropic");
  await page.locator("#api-key").fill(FAKE_KEY);
  await page.getByRole("button", { name: "Save provider and key" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("smartbite.anthropicKey"))).toBe(JSON.stringify(FAKE_KEY));

  // Step 1 -> 4 ideas
  await page.goto("/?tab=make-meal");
  await page.locator("#input-craving").fill("chicken bowl with rice and cucumber");
  await page.getByRole("button", { name: "Show me 4 ideas" }).click();
  const cards = page.locator("#ideas-card-grid > div");
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toContainText("Greek chicken bowl");
  await expect(cards.first()).toContainText("AI-generated");
  await expect(page.locator("#demo-note")).toHaveCount(0);

  // Preview -> Select meal -> recipe (mocked) -> real /api/evaluate -> rerun with the RERUN block (mocked) ->
  // /api/evaluate again -> recipe page with the second attempt
  await cards.first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#idea-preview-title")).toHaveText("Greek chicken bowl");
  const engineReplies = [];
  page.on("response", (r) => {
    if (r.url().endsWith("/api/evaluate") && r.request().method() === "POST") engineReplies.push(r);
  });
  await dialog.getByRole("button", { name: "Select meal" }).click();

  await page.waitForURL(/\/recipes\/greek-chicken-bowl-[a-z0-9]+$/);
  expect(engineReplies.length).toBe(2);
  expect(engineReplies.map((r) => r.status())).toEqual([200, 200]);
  const firstMeal = await engineReplies[0].json();
  expect(firstMeal.evaluation.macros.misses.length).toBeGreaterThan(0);
  const meal = await engineReplies[1].json();
  expect(meal.evaluation.macros.misses).toEqual([]);
  expect(meal.evaluation.macros.per_serving.kcal).toBeGreaterThan(0);
  const rerunCall = calls.find((c) => c.step === "rerun");
  expect(rerunCall.user).toContain("RERUN: attempt 2 of 3");
  expect(rerunCall.user).toContain("MACROS PER SERVING, COMPUTED IN CODE:");
  expect(rerunCall.user).toContain("- chicken breast: at most 195 g (first recipe 170 g)");

  await expect(page.locator("#picked-meal-title")).toHaveText("Greek chicken bowl");
  await expect(page.getByText("Chosen Custom Recipe")).toBeVisible();
  await expect(page.getByText("AI-generated", { exact: true }).first()).toBeVisible();
  // Macros on the page are the engine's numbers
  await expect(page.locator("#tile-kcal")).toHaveText(String(Math.round(meal.evaluation.macros.per_serving.kcal)));
  // Packs: one row per bought food, whole packs
  const packRows = page.locator("#pack-table-body tr");
  await expect(packRows).toHaveCount(meal.evaluation.pack.lines.filter((l) => !l.optional).length);
  await expect(packRows.filter({ hasText: "chicken breast" })).toBeVisible();

  expect(calls.map((c) => c.step)).toEqual(["ideas", "recipe", "rerun"]);
  expect(calls.every((c) => c.key === FAKE_KEY)).toBe(true);

  // Add to cart -> Cart tab
  await page.getByRole("button", { name: "Add to my cart" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("smartbite.cart") || "{}").meals?.length ?? 0)).toBe(1);
  await page.locator("#nav-cart").click();
  await page.waitForURL(/tab=cart/);
  const cartTab = page.locator("#tab-cart");
  await expect(cartTab.getByRole("heading", { name: "Added Meals" })).toBeVisible();
  await expect(cartTab).toContainText("Greek chicken bowl");
  await expect(cartTab.getByRole("heading", { name: "Consolidated Shopping List" })).toBeVisible();

  // Adjust leftovers: suggestions from code, previewed, then applied
  await expect(cartTab.getByRole("heading", { name: "Your Leftovers" })).toBeVisible();
  await cartTab.getByRole("button", { name: "Adjust leftovers to meals" }).click();
  const apply = cartTab.getByRole("button", { name: "Apply" });
  await expect(apply).toBeEnabled();
  await apply.click();
  await expect(cartTab.getByText("Adjusted", { exact: true })).toBeVisible();
  await expect(cartTab.getByRole("button", { name: "Undo adjustments" })).toBeVisible();

  // Back to Make Your Meal: the cart leftovers are offered for the craving, each button with its own React key
  await page.goto("/?tab=make-meal");
  await expect(page.locator("#craving-leftovers button").first()).toBeVisible();
  expect(consoleText.filter((t) => t.includes('unique "key" prop'))).toEqual([]);

  expect(calls.filter((c) => c.step === "unexpected")).toEqual([]);
});
