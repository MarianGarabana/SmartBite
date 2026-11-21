// Spanish version (decided 2026-11-21) on the running dev server with the real engine. No model runs.
// 1. The browser language picks Spanish; the footer switch changes it, is remembered in localStorage, sets <html lang>
//    and leaves no cookie.
// 2. Key screens in Spanish (home, Make Your Meal quiz, a demo recipe page, cart, profile): no English left in the
//    interface and no sideways scroll at 390 px. AI-written text (meal names, recipe steps) stays as the model wrote it.
import fs from "node:fs";
import { expect, test } from "@playwright/test";

const DEMO_SLUG = "tuna-frittata-with-vegetables";
// Words that only English interface text would have (none is a Spanish word); whole words, accents count as letters
const ENGLISH = /(?<![\p{L}\p{N}])(the|and|your|you|with|for|from|this|that|add|added|show|cart|servings?|meals?|recipes?|ingredients?|protein|shopping|prices?|budget|leftovers?|make|continue|back|save|delete|edit|home|how|works|what|which|per|day|packs?|other|here|open|close|more|less|choose|pick|start|get|see|only|not|of|to|is|it|on|or|by|at|are|will|can|need|want|keep|use|left|bought|used)(?![\p{L}\p{N}])/iu;
// Names that stay as they are in Spanish: the brand, data sources, licences, AI providers, the loanword "meal prep"
const NAMES = ["SmartBite", "Open Food Facts", "USDA FoodData Central", "FoodData Central", "Ciqual", "ODbL", "AGPL-3.0",
  "MyFitnessPal", "meal prep", "Meal prep", "Anthropic", "OpenAI", "OpenRouter", "Google Gemini", "Gemini", "Ollama", "Claude", "GitHub"];

// Visible text of a part of the page with the AI-written meal names and the excluded parts taken out
async function interfaceText(page, root, { skip = [] } = {}) {
  const names = await page.evaluate(async () => (await (await fetch("/demo-meals.json")).json()).map((m) => m.name));
  let text = await page.evaluate(({ root, skip }) => {
    const el = document.querySelector(root);
    if (!el) return "";
    const copy = el.cloneNode(true);
    // innerText needs the copy in the page; hidden parts stay hidden through their classes
    copy.style.position = "absolute";
    copy.style.left = "-99999px";
    copy.querySelectorAll(skip.join(",") || "#none").forEach((n) => n.remove());
    document.body.appendChild(copy);
    const out = copy.innerText;
    copy.remove();
    return out;
  }, { root, skip });
  for (const n of [...names].sort((a, b) => b.length - a.length)) text = text.split(n).join(" ");
  for (const n of NAMES) text = text.split(n).join(" ");
  return text;
}

async function expectNoEnglish(page, root, opts) {
  const text = await interfaceText(page, root, opts);
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => ENGLISH.test(l));
  expect(lines, `English left in ${root} on ${page.url()}`).toEqual([]);
}

async function expectNoSidewaysScroll(page) {
  const { scroll, width } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
  expect(scroll, `sideways scroll on ${page.url()}`).toBeLessThanOrEqual(width);
}

test.describe("browser in Spanish", () => {
  test.use({ locale: "es-ES" });

  test("Spanish from the browser language, the footer switch goes to English and back, no cookie", async ({ page, context }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("#nav-home")).toHaveText("Inicio");
    await expect(page.locator("#footer-lang")).toHaveText("English");
    await page.locator("#footer-lang").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#nav-home")).toHaveText("Home");
    expect(await page.evaluate(() => localStorage.getItem("smartbite.lang"))).toBe(JSON.stringify("en"));
    await page.reload();
    await expect(page.locator("#nav-home")).toHaveText("Home"); // the choice wins over the browser language
    await page.locator("#footer-lang").click();
    await expect(page.locator("#nav-home")).toHaveText("Inicio");
    await expect(page).toHaveTitle("SmartBite - planificador de comidas con paquetes enteros");
    expect(await context.cookies()).toEqual([]);
  });
});

test("an English browser gets English; the switch picks Spanish and the next page keeps it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#footer-lang")).toHaveText("Español");
  await page.locator("#footer-lang").click();
  await expect(page.locator("#nav-cart")).toHaveText("Carrito");
  await page.goto("/privacy");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("#nav-cart")).toHaveText("Carrito");
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test.describe(`Spanish screens at ${viewport.width} px`, () => {
    test.use({ locale: "es-ES", viewport });

    test("home and profile", async ({ page }) => {
      for (const url of ["/", "/demo", "/profile", "/start"]) {
        await page.goto(url);
        await expect(page.locator("html")).toHaveAttribute("lang", "es");
        await expectNoEnglish(page, "body");
        await expectNoSidewaysScroll(page);
      }
    });

    test("Make Your Meal quiz, every question and the summary", async ({ page }) => {
      await page.goto("/demo?tab=make-meal");
      await page.locator("#input-craving").fill("tortilla de atún");
      const step = page.locator("#make-step-1");
      const show = page.getByRole("button", { name: "Ver 4 ideas" });
      for (let i = 0; i < 12 && !(await show.isVisible()); i++) {
        await expectNoEnglish(page, "#make-step-1");
        await expectNoSidewaysScroll(page);
        await step.getByRole("button", { name: /^Continuar/ }).click();
      }
      await expect(show).toBeVisible();
      await expectNoEnglish(page, "#make-step-1");
      await expectNoSidewaysScroll(page);
    });

    test("a demo recipe page shows the foods in Spanish", async ({ page }) => {
      await page.goto(`/recipes/${DEMO_SLUG}`);
      const list = page.locator("#picked-ingredients-list");
      await expect(list).toContainText("atún al natural (lata)");
      await expect(list).toContainText("calabacín");
      await expect(list).toContainText("pimiento rojo");
      await expect(page.locator("#pack-table-body")).toContainText("huevos");
      await expectNoEnglish(page, "body", { skip: ["#picked-steps-list"] }); // steps are AI-written
      await expectNoSidewaysScroll(page);
    });

    test("cart with a demo meal: shopping list in Spanish", async ({ page }) => {
      await page.addInitScript((slug) => {
        if (!localStorage.getItem("smartbite.demoCart")) localStorage.setItem("smartbite.demoCart", JSON.stringify({ meals: [{ slug }] }));
      }, DEMO_SLUG);
      await page.goto("/demo?tab=cart");
      const list = page.locator("#cart-consolidated-tbody");
      await expect(list).toContainText("atún al natural (lata)");
      await expect(list).toContainText("calabacín");
      await expectNoEnglish(page, "body");
      await expectNoSidewaysScroll(page);
    });
  });
}

// 2026-11-21, after the owner's review: the switch in the profile menu, Mexico's names, money by country, the engine's
// counted_as note, and the My Day food picker in Spanish
const seed = (page, items) => page.addInitScript((kv) => {
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
}, items);
const SET_UP = { "smartbite.anthropicKey": "sk-ant-e2e-fake-key-0000", "smartbite.setup": "done" };

test.describe("Spanish browser, more", () => {
  test.use({ locale: "es-ES" });

  test("language lives in the footer and on the Profile page, not in the profile menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menú del perfil" }).click();
    await expect(page.getByRole("menuitem")).toHaveText(["Empezar"]); // a site setting, not a profile action (2026-11-21)
    await page.goto("/profile");
    const select = page.getByLabel("Idioma");
    await expect(select).toHaveValue("es");
    await select.selectOption("en");
    await expect(page.getByLabel("Language")).toHaveValue("en");
    await expect(page.locator("#footer-lang")).toHaveText("Español");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("smartbite.lang")))).toBe("en"); // stored as JSON like the other keys
  });

  test("Spain: Spain's food names and money as 5,50 €", async ({ page }) => {
    await page.goto(`/recipes/${DEMO_SLUG}`);
    await expect(page.locator("#picked-ingredients-list")).toContainText("calabacín");
    await expect(page.locator("#summary-bought-cost")).toHaveText(/^\d+,\d\d\s€$/);
  });

  test("Mexico: Mexico's food names, gear words and money as $5.50", async ({ page }) => {
    await seed(page, { "smartbite.country": "MX" });
    await page.goto(`/recipes/${DEMO_SLUG}`);
    const list = page.locator("#picked-ingredients-list");
    await expect(list).toContainText("calabacita");
    await expect(list).not.toContainText("calabacín");
    await page.goto("/demo?tab=make-meal"); // no price estimates for Mexico yet: the quiz shows the budget
    await page.locator("#input-craving").fill("tortilla");
    await expect(page.locator("#make-step-1")).toContainText(/\$\d+\.\d\d/);
    for (let i = 0; i < 12 && !(await page.locator("#make-step-1 h2", { hasText: "¿Con qué puedes cocinar?" }).isVisible()); i++) {
      await page.locator("#make-step-1").getByRole("button", { name: /^Continuar/ }).click();
    }
    await expect(page.locator("#make-step-1")).toContainText("Estufa");
    await expect(page.locator("#make-step-1")).toContainText("Licuadora");
    await expectNoSidewaysScroll(page);
  });

  test("a name the food table does not have says which food it was counted as", async ({ page }) => {
    const demo = JSON.parse(fs.readFileSync(`demo/meals/${DEMO_SLUG}.json`, "utf8"));
    const { photo: _p, photo_ai_generated: _a, demo: _d, ...doc } = demo;
    doc.recipe.ingredients = doc.recipe.ingredients.map((i) => (i.name === "canned tuna in water" ? { ...i, name: "pork chops" } : i));
    await seed(page, { ...SET_UP, "smartbite.meals": { "pork-frittata": { ...doc, slug: "pork-frittata" } } });
    await page.goto("/recipes/pork-frittata");
    const row = page.locator("#pack-table-body tr", { hasText: "pork chops" });
    await expect(row).toContainText("Macros: Ciqual, contado como lomo de cerdo");
    await page.locator("#footer-lang").click();
    await expect(page.locator("#pack-table-body tr", { hasText: "pork chops" })).toContainText("Macros: Ciqual, counted as pork loin");
  });

  test("My Day food picker in Spanish: Spanish and Mexican names find the new foods", async ({ page }) => {
    await seed(page, SET_UP);
    await page.route("**/api/**", (route) => route.abort());
    await page.goto("/?tab=my-day");
    await page.getByRole("button", { name: "Añadir a Comida" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Alimentos" }).click();
    const search = dialog.getByLabel("Buscar alimentos");
    const first = dialog.locator("#day-food-list li").first();
    for (const [q, shown] of [["miel", "Miel"], ["durazno", "Melocotón"], ["chícharos", "Guisantes congelados"], ["pollo entero", "Pollo entero"]]) {
      await search.fill(q);
      await expect(first, q).toContainText(shown);
    }
    await search.fill("melocoton");
    await first.getByRole("button").click();
    await dialog.getByLabel("Gramos").fill("150");
    await expect(dialog.locator("#day-food-preview")).toContainText("Para 150 g");
    await expect(dialog.locator("#day-food-protein_g")).toContainText(","); // 1,4 g: Spain's decimal comma
    await dialog.getByRole("button", { name: "Añadir a Comida" }).click();
    await expect(page.locator("#day-slot-lunch")).toContainText("Melocotón (150 g)");
    await expectNoEnglish(page, "#tab-my-day");
    await expectNoSidewaysScroll(page);
  });
});

test("USA in English: money as $5.50", async ({ page }) => {
  await seed(page, { "smartbite.country": "US" });
  await page.goto(`/recipes/${DEMO_SLUG}`);
  await expect(page.locator("#summary-bought-cost")).toHaveText(/^\$\d+\.\d\d$/);
});
