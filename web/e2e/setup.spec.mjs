// Create profile, the profile menu and the phone menu (decided 2026-10-22) on the running dev server (3100). No model
// runs. Since 2026-10-30 the real Make Your Meal waits for a complete profile (key + setup) and never shows demo ideas.
// 1. Without a complete profile, Step 1 offers Set up profile or Try the demo; a key and targets saved before count.
// 2. Create profile from the menu: shop, targets and key steps, then Make Your Meal starts from the new targets.
// 3. Phones: no sideways scroll, the tabs sit in a menu; desktop keeps the tab bar.
import { expect, test } from "@playwright/test";

test("without a complete profile, Make Your Meal offers Set up profile or Try the demo, never demo ideas", async ({ page }) => {
  await page.goto("/?tab=make-meal");
  const card = page.locator("#make-setup");
  await expect(card).toContainText("Set up your profile first");
  await expect(page.locator("#input-craving")).toBeHidden();
  await expect(page.locator("#ideas-card-grid")).toHaveCount(0);
  await expect(page.locator("#demo-note")).toHaveCount(0);

  // Set up profile opens the setup; skipped, the card stays
  await card.getByRole("button", { name: "Set up profile" }).click();
  const setup = page.getByRole("dialog");
  await expect(setup).toContainText("Where you shop");
  await setup.getByRole("button", { name: "Skip setup" }).click();
  await expect(setup).toHaveCount(0);
  await expect(card).toBeVisible();
  // Finished without a key: still not complete
  await card.getByRole("button", { name: "Set up profile" }).click();
  for (let i = 0; i < 3; i++) await setup.getByRole("button", { name: "Skip this step" }).click();
  await setup.getByRole("button", { name: "Make Your Meal" }).click();
  await expect(card).toBeVisible();
  await expect(page.locator("#input-craving")).toBeHidden();

  await card.getByRole("link", { name: "Try the demo" }).click();
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
  await expect(page.locator("#input-calories")).toHaveValue("520");
  await expect(page.locator("#make-setup")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("smartbite.setup"))).toBeNull(); // never sent through the setup
});

test("Create profile from the menu saves shop, targets and key, then Make Your Meal starts from them", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Create profile" }).click();
  const setup = page.getByRole("dialog");
  await expect(setup).toContainText("Step 1 of 3");
  await setup.locator("#setup-region").selectOption("ES-MD");
  await setup.locator("#setup-store").selectOption("mercadona");
  await setup.getByRole("button", { name: "Next" }).click();

  await expect(setup).toContainText("Your targets");
  await setup.locator("#setup-kcal").fill("520");
  await setup.locator("#setup-protein").fill("40");
  await setup.locator("#setup-kcal").fill("9");
  await setup.getByRole("button", { name: "Next" }).click();
  await expect(setup).toContainText("Calories per meal: a number from 100 to 3000.");
  // An out-of-range kcal stops on this step; a fixed one moves on
  await setup.locator("#setup-kcal").fill("520");
  await setup.locator("#setup-budget").fill("6");
  await setup.getByRole("button", { name: "Next" }).click();
  await expect(setup).toContainText("Your AI key");
  await setup.locator("#setup-key").fill("sk-ant-test-key");
  await setup.getByRole("button", { name: "Save key" }).click();
  await expect(setup).toContainText("You're set");
  await setup.getByRole("button", { name: "Make Your Meal" }).click();

  await expect(page.locator("#input-budget")).toBeVisible(); // the main page switches tabs in place
  await expect(page.locator("#input-budget")).toHaveValue("6.00");
  const saved = await page.evaluate(() => ({ region: localStorage.getItem("smartbite.region"),
    store: localStorage.getItem("smartbite.store"), key: localStorage.getItem("smartbite.anthropicKey"),
    setup: localStorage.getItem("smartbite.setup") }));
  expect(saved).toEqual({ region: '"ES-MD"', store: '"mercadona"', key: '"sk-ant-test-key"', setup: '"done"' });
  await page.getByRole("button", { name: "Profile menu" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Profile", "Save profile file", "Open profile file"]);
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: "Save profile file" }).click()]);
  expect(file.suggestedFilename()).toMatch(/^smartbite-profile-/);
});

test("a bad number in the setup targets gets a plain message and is not saved", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Profile menu" }).click();
  await page.getByRole("menuitem", { name: "Create profile" }).click();
  const setup = page.getByRole("dialog");
  await setup.getByRole("button", { name: "Skip this step" }).click();
  await setup.locator("#setup-kcal").fill("9");
  await setup.getByRole("button", { name: "Next" }).click();
  await expect(setup).toContainText("Calories per meal: a number from 100 to 3000.");
  expect(await page.evaluate(() => localStorage.getItem("smartbite.profile"))).toBeNull();
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
