// Create profile, the profile menu and the phone menu (decided 2026-10-22) on the running dev server (3100). No model
// runs. Since 2026-10-30 the real Make Your Meal waits for a complete profile (key + setup) and never shows demo ideas.
// 1. Without a complete profile, Make Your Meal goes to /start (Use my API key or Try the demo); a key and targets
//    saved before count.
// 2. Get started from the menu (/start), then the setup: shop and key steps (no targets, no Skip since 2026-10-31), then Make Your Meal.
// 3. Phones: no sideways scroll, the tabs sit in a menu; desktop keeps the tab bar.
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

test("without a complete profile, Make Your Meal goes to /start, never to demo ideas", async ({ page }) => {
  await page.goto("/?tab=make-meal");
  await expect(page).toHaveURL(/\/start$/);
  await expect(page.locator("#ideas-card-grid")).toHaveCount(0);
  await expect(page.locator("#demo-note")).toHaveCount(0);
  // The tab in the nav goes there too
  await page.goto("/");
  await page.locator("header nav").first().getByRole("button", { name: "Make Your Meal" }).click();
  await expect(page).toHaveURL(/\/start$/);

  // Use my API key opens the setup (2 steps, no Skip); closed, the page stays
  const key = page.locator("#start-key");
  await key.getByRole("button", { name: "Use my API key" }).click();
  const setup = page.getByRole("dialog");
  await expect(setup).toContainText("Step 1 of 2");
  await expect(setup).toContainText("Where you shop");
  await expect(setup.getByRole("button", { name: /Skip/ })).toHaveCount(0);
  await setup.getByRole("button", { name: "Close" }).click();
  await expect(setup).toHaveCount(0);
  await expect(page).toHaveURL(/\/start$/);
  // The key step does not finish without a key
  await key.getByRole("button", { name: "Use my API key" }).click();
  await setup.getByRole("button", { name: "Next" }).click();
  await expect(setup).toContainText("Step 2 of 2");
  await expect(setup.getByRole("button", { name: /Skip/ })).toHaveCount(0);
  await setup.getByRole("button", { name: "Save key" }).click();
  await expect(setup).toContainText("Paste your key first.");
  await expect(setup).toContainText("Step 2 of 2");
  await setup.getByRole("button", { name: "Close" }).click();
  await expect(page).toHaveURL(/\/start$/);

  await page.locator("#start-demo").getByRole("link", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator("#demo-banner")).toBeVisible();
});

test("a key and saved targets from before the setup count as a complete profile", async ({ page }) => {
  await page.goto("/profile");
  await page.evaluate(() => {
    localStorage.setItem("smartbite.anthropicKey", JSON.stringify("sk-ant-old-key"));
    localStorage.setItem("smartbite.profile", JSON.stringify({ sections: [{ id: "targets", fields: [
      { id: "kcal_target", type: "number", value: 520 }, { id: "protein_g_target", type: "number", value: 40 }] }] }));
  });
  await page.goto("/?tab=make-meal");
  await expect(page.locator("#input-craving")).toBeVisible();
  await page.locator("#input-craving").fill("chicken");
  await goToQuestion(page, "How big should it be?");
  await expect(page.locator("#input-calories")).toHaveValue("520");
  await expect(page.locator("#make-setup")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("smartbite.setup"))).toBeNull(); // never sent through the setup
});

test("Get started from the menu leads to /start; the setup saves shop and key, then Make Your Meal opens", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Profile menu" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Get started"]);
  await page.getByRole("menuitem", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/start$/);
  await page.locator("#start-key").getByRole("button", { name: "Use my API key" }).click();
  const setup = page.getByRole("dialog");
  await expect(setup).toContainText("Step 1 of 2");
  await setup.locator("#setup-region").selectOption("ES-MD");
  await setup.locator("#setup-store").selectOption("mercadona");
  await setup.getByRole("button", { name: "Next" }).click();

  // No targets step (decided 2026-10-31): targets are set in the Make Your Meal form
  await expect(setup).toContainText("Your AI key");
  await setup.locator("#setup-key").fill("sk-ant-test-key");
  await setup.getByRole("button", { name: "Save key" }).click();
  await expect(setup).toContainText("You're set");
  await setup.getByRole("button", { name: "Make Your Meal" }).click();

  await expect(page.locator("#input-craving")).toBeVisible();
  const saved = await page.evaluate(() => ({ region: localStorage.getItem("smartbite.region"),
    store: localStorage.getItem("smartbite.store"), key: localStorage.getItem("smartbite.anthropicKey"),
    setup: localStorage.getItem("smartbite.setup") }));
  expect(saved).toEqual({ region: '"ES-MD"', store: '"mercadona"', key: '"sk-ant-test-key"', setup: '"done"' });
  await page.getByRole("button", { name: "Profile menu" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Profile", "Save profile file"]); // opening a file is on the Profile page
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Save profile file" }).click()]);
  expect(file.suggestedFilename()).toMatch(/^smartbite-profile-/);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("no sideways scroll, and the tabs are in a menu", async ({ page }) => {
    for (const url of ["/", "/demo", "/profile", "/recipes/korean-beef-bowl-with-peas-and-brown-rice-lentil-mix", "/privacy"]) {
      await page.goto(url);
      const header = await page.locator("header").evaluate((h) => h.scrollWidth);
      expect(header, url).toBeLessThanOrEqual(390);
    }
    await page.goto("/");
    await expect(page.locator("#nav-cart")).toBeHidden();
    await page.getByRole("button", { name: "Menu", exact: true }).click();
    await page.getByRole("menuitem", { name: "Cart" }).click();
    await expect(page.locator("#cart-empty-state")).toBeVisible(); // the main page switches tabs in place
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
  test("the Cart with optional items and the footer stay inside the screen", async ({ page }) => {
    await page.goto("/recipes/classic-lentil-stew-with-chickpeas-and-chicken"); // has optional oil and spices
    await page.getByRole("button", { name: "Add to my cart" }).click();
    await page.goto("/demo?tab=cart"); // a demo meal: the demo cart
    await expect(page.locator("#cart-consolidated-tbody tr").first()).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    const links = await page.locator("footer nav > *").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    for (const r of links) expect(r.left >= 0 && r.right <= 390).toBe(true);
  });
});

test("the shopping tables fit their card at every width, with no sideways scroll inside", async ({ page }) => {
  await page.goto("/recipes/classic-lentil-stew-with-chickpeas-and-chicken");
  await page.getByRole("button", { name: "Add to my cart" }).click();
  const fits = (sel) => page.locator(sel).evaluate((b) => {
    const t = b.closest("table");
    return t.getBoundingClientRect().width <= t.parentElement.getBoundingClientRect().width + 1;
  });
  for (const width of [390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/recipes/classic-lentil-stew-with-chickpeas-and-chicken");
    await expect(page.locator("#pack-table-body tr").first()).toBeVisible();
    expect(await fits("#pack-table-body"), `recipe at ${width}`).toBe(true);
    await page.goto("/demo?tab=cart");
    await expect(page.locator("#cart-consolidated-tbody tr").first()).toBeVisible();
    expect(await fits("#cart-consolidated-tbody"), `cart at ${width}`).toBe(true);
  }
});

test("desktop keeps the tab bar and has no tabs menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#nav-cart")).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
});
