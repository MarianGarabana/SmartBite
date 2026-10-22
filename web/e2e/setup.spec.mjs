// Create profile, the profile menu and the phone menu (decided 2026-10-22) on the running dev server (3100). No model
// runs: without a key, Make Your Meal shows the demo ideas.
// 1. A new visitor's first "Show me 4 ideas" opens the setup once; Skip carries on to the demo ideas.
// 2. Create profile from the menu: shop, targets and key steps, then Make Your Meal starts from the new targets.
// 3. Phones: no sideways scroll, the tabs sit in a menu; desktop keeps the tab bar.
import { expect, test } from "@playwright/test";

test("a new visitor's first ideas open the setup once, and Skip goes on to the demo ideas", async ({ page }) => {
  await page.goto("/?tab=make-meal");
  await page.locator("#input-craving").fill("chicken bowl");
  await page.getByRole("button", { name: "Show me 4 ideas" }).click();
  const setup = page.getByRole("dialog");
  await expect(setup).toContainText("Where you shop");
  await setup.getByRole("button", { name: "Skip setup" }).click();
  await expect(setup).toHaveCount(0);
  await expect(page.locator("#demo-note")).toBeVisible();
  await expect(page.locator("#ideas-card-grid > div")).toHaveCount(4);

  // Not again
  await page.goto("/?tab=make-meal");
  await page.locator("#input-craving").fill("salmon salad");
  await page.getByRole("button", { name: "Show me 4 ideas" }).click();
  await expect(page.locator("#demo-note")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // Skipped is not a profile: the menu still offers Create profile
  await page.getByRole("button", { name: "Profile menu" }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Create profile", "Open profile file"]);
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
    for (const url of ["/", "/profile", "/recipes/korean-beef-bowl-with-peas-and-brown-rice-lentil-mix", "/privacy"]) {
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
});

test("desktop keeps the tab bar and has no tabs menu", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#nav-cart")).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu", exact: true })).toBeHidden();
});
