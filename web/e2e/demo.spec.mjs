// Demo and real split (decided 2026-10-30) on the running dev server (3100) with the real engine (8100). No model runs.
// 1. /demo opens from /start, the Home box and the footer (the header Demo item left on 2026-11-03).
// 2. /demo runs the demo flow with no key: craving, demo ideas, a demo recipe page that leads back into /demo.
// 3. The real app shows only the user's own meals; a new visitor gets Set up profile or Try the demo.
// 4. The demo cart is kept apart from the real cart.
import { expect, test } from "@playwright/test";

// Make Your Meal is a quiz (2026-11-09): type the craving, click Continue through the questions, then ask for ideas
async function askForIdeas(page, craving) {
  await page.locator("#input-craving").fill(craving);
  const show = page.getByRole("button", { name: "Show me 4 ideas" });
  for (let i = 0; i < 10 && !(await show.isVisible()); i++) await page.getByRole("button", { name: /^(Continue|Back to summary)/ }).click();
  await show.click();
}
// Click Continue until the question with this title shows
async function goToQuestion(page, title) {
  const heading = page.locator("#make-step-1 h2", { hasText: title });
  for (let i = 0; i < 10 && !(await heading.isVisible()); i++) await page.getByRole("button", { name: /^Continue/ }).click();
  await expect(heading).toBeVisible();
}

const DEMO_SLUG = "tuna-frittata-with-vegetables";
const cartMeals = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}").meals?.length ?? 0, key);

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  // Decided 2026-11-03: no Demo item in the header; until the profile is complete, Get started leads to /start
  test("a new visitor gets Get started next to the menus; once set up, no pill and no Demo item", async ({ page }) => {
    for (const url of ["/", "/profile", "/privacy", "/demo"]) {
      await page.goto(url);
      await expect(page.locator("#nav-start"), url).toBeVisible();
      await expect(page.locator("header").getByRole("link", { name: "Demo", exact: true }), url).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), url).toBeLessThanOrEqual(390);
    }
    await page.locator("#nav-start").click();
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.locator("#nav-start")).toHaveCount(0); // not on /start itself
    await page.locator("#start-demo").getByRole("link", { name: "Try the demo" }).click();
    await expect(page.locator("#demo-banner")).toBeVisible();
    await expect(page.locator("#home-kitchen-grid > div")).toHaveCount(5);

    await page.evaluate(() => { localStorage.setItem("smartbite.anthropicKey", JSON.stringify("sk-ant-test")); localStorage.setItem("smartbite.setup", JSON.stringify("done")); });
    for (const url of ["/", "/profile"]) {
      await page.goto(url);
      await expect(page.locator("#nav-start"), url).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), url).toBeLessThanOrEqual(390);
    }
    await page.locator("#footer-demo").click();
    await expect(page).toHaveURL(/\/demo$/);
  });
});

test("desktop: the header ends at How It Works; the demo is in the footer", async ({ page }) => {
  await page.goto("/");
  const items = await page.locator("header nav").first().locator("button, a").allInnerTexts();
  expect(items.at(-1)).toBe("How It Works");
  await expect(page.locator("header").getByRole("link", { name: "Demo", exact: true })).toHaveCount(0);
  await expect(page.locator("#nav-start")).toHaveText("Get started"); // new visitor: the pill to /start
  await page.locator("#footer-demo").click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator("#demo-banner")).toBeVisible();
});

test("the demo runs with no key: craving, demo ideas, recipe page, and back into the demo", async ({ page }) => {
  const llm = [];
  page.on("request", (r) => { if (/anthropic|openai|openrouter|googleapis/.test(r.url())) llm.push(r.url()); });
  await page.goto("/demo");
  await page.locator("#nav-make-meal").click();
  await expect(page).toHaveURL(/\/demo\?tab=make-meal$/);
  await askForIdeas(page, "tuna frittata");
  await expect(page.getByRole("dialog")).toHaveCount(0); // no setup in the demo
  await expect(page.locator("#demo-note")).toBeVisible();
  const cards = page.locator("#ideas-card-grid > div");
  await expect(cards).toHaveCount(4);
  await expect(cards.first()).toContainText(/tuna frittata/i);
  await cards.first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Select meal" }).click();
  await page.waitForURL(new RegExp(`/recipes/${DEMO_SLUG}$`));
  await expect(page.getByText("Demo Meal", { exact: true })).toBeVisible();

  // Header and the Back link lead back into the demo, not the real app
  await page.locator("#nav-cart").click();
  await expect(page).toHaveURL(/\/demo\?tab=cart$/);
  await page.goto(`/recipes/${DEMO_SLUG}`);
  await page.getByRole("button", { name: "Back to recipes" }).click();
  await expect(page).toHaveURL(/\/demo\?tab=recipes$/);
  await expect(page.locator("#recipes-grid a[href^='/recipes/']")).toHaveCount(13);
  expect(llm).toEqual([]);
});

test("demo tabs show in the address under /demo, and Back goes to the tab before", async ({ page }) => {
  await page.goto("/demo");
  await page.locator("#nav-cart").click();
  await expect(page).toHaveURL(/\/demo\?tab=cart$/);
  await page.locator("#nav-recipes").click();
  await expect(page).toHaveURL(/\/demo\?tab=recipes$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/demo\?tab=cart$/);
  await expect(page.locator("#tab-cart")).toBeVisible();
});

test("the real app shows only the user's meals; a new visitor gets Set up profile or Try the demo", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#home-setup")).toContainText("Set up your profile first");
  await expect(page.locator("#home-kitchen-grid")).toHaveCount(0);
  await expect(page.locator("#demo-banner")).toHaveCount(0);
  await page.goto("/?tab=recipes");
  await expect(page.locator("#recipes-setup")).toBeVisible();
  await expect(page.locator("#tab-recipes a[href^='/recipes/']")).toHaveCount(0);
  await expect(page.locator("#recipes-kept")).toHaveCount(0); // no meals of its own: no profile file note
  await page.locator("#recipes-setup").getByRole("link", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/demo$/);
});

test("the demo cart is kept apart from the real cart", async ({ page }) => {
  await page.goto("/demo?tab=recipes");
  await page.locator("#recipes-grid > div").first().getByRole("button", { name: "Add to cart" }).click();
  await expect.poll(() => cartMeals(page, "smartbite.demoCart")).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem("smartbite.cart"))).toBeNull();
  await expect(page.locator("#cart-badge")).toHaveText("1");

  await page.goto("/?tab=cart");
  await expect(page.locator("#cart-empty-state")).toBeVisible();
  await expect(page.locator("#cart-badge")).toHaveText("0");
  // A demo meal's page adds to the demo cart too
  await page.goto(`/recipes/${DEMO_SLUG}`);
  await page.getByRole("button", { name: "Add to my cart" }).click();
  await expect.poll(() => cartMeals(page, "smartbite.demoCart")).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem("smartbite.cart"))).toBeNull();
  await page.goto("/demo?tab=cart");
  await expect(page.locator("#cart-meals-container > div")).toHaveCount(2);
});
