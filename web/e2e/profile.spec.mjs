// Profile (was Settings, decided 2026-10-22) on the running dev server (3100) with the real engine (8100). No model runs.
// 1. The old /settings link opens the Profile; a display name shows in the heading.
// 2. A country with another currency changes the price symbol everywhere and turns Spain's estimates off.
// 3. The country list is the 8 countries with supermarket data plus Other country; each lists its own supermarkets.
// 4. Canada: estimated prices in CAD from Statistics Canada on the recipe page; off when turned off. The UK: GBP, ONS.
//    The US: USD, BLS.
import { expect, test } from "@playwright/test";

const KOREAN = "korean-beef-bowl-with-peas-and-brown-rice-lentil-mix";

// Recipe pages open at the meal's own servings (8 here); these checks are for 1 serving
async function toOneServing(page) {
  const count = page.locator("#servings-count");
  const minus = page.locator("button", { hasText: /^-$/ }).first();
  const reply = page.waitForResponse((r) => r.url().includes("/api/evaluate")
    && /"servings":1[,}]/.test(r.request().postData() || "")); // the engine's packs for 1 serving
  while ((await count.innerText()) !== "1") await minus.click();
  await reply;
}

test("the old Settings link opens the Profile, and the name shows in its heading", async ({ page }) => {
  // Country names differ between the server's and the browser's Intl data: no hydration error may come of it
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message.split("\n")[0]));
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your profile");
  await expect(page.locator("#price-country option")).not.toHaveCount(1); // the full list, after the first render
  expect(errors).toEqual([]);
  await page.locator("#profile-name").fill("Marta");
  await page.locator("#profile-name").press("Enter");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Marta's profile");
  await page.reload();
  await expect(page.locator("#profile-name")).toHaveValue("Marta");
  await expect(page.getByRole("link", { name: "Profile" }).first()).toBeVisible();
});

test("a country's currency shows on prices, and Spain's estimates need euros", async ({ page }) => {
  await page.goto(`/recipes/${KOREAN}`);
  await toOneServing(page);
  await expect(page.locator("#pack-table-body").getByText("est.").first()).toBeVisible();
  await expect(page.locator("#summary-bought-cost")).toContainText("€");

  await page.goto("/profile");
  await page.locator("#price-country").selectOption("AU"); // no estimated prices for Australia
  await expect(page.locator("#currency")).toHaveValue("AUD");
  await page.goto(`/recipes/${KOREAN}`);
  await toOneServing(page);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#pack-table-body").getByText("est.")).toHaveCount(0);
  await expect(page.locator("#summary-bought-cost")).toHaveText("No prices yet");
  const beef = page.locator("#pack-table-body tr").filter({ hasText: "ground beef" });
  await expect(beef.locator("input")).toHaveAttribute("placeholder", "A$ / pack");
  await beef.locator("input").fill("4.99");
  await expect(beef).toContainText("A$ 4.99"); // symbols longer than one character get a space, as for CA$
  await expect(page.locator("#summary-bought-cost")).toContainText(/A\$ ?4\.99/);

  // Back to Spain but paying in pounds: estimates stay off; then euros brings them back
  await page.goto("/profile");
  await page.locator("#price-country").selectOption("ES");
  await expect(page.locator("#currency")).toHaveValue("EUR");
  await page.locator("#currency").selectOption("GBP");
  await expect(page.locator("#price-region")).toHaveCount(0);
  await page.locator("#currency").selectOption("EUR");
  await expect(page.locator("#price-region")).toBeVisible();
  await page.goto(`/demo?tab=make-meal`); // the same form; the real one waits for a key
  await expect(page.getByText("Total budget (€)")).toBeVisible();
});

test("a profile file saved in one browser opens in another, after a confirm and a backup download", async ({ browser }, testInfo) => {
  // Browser A: a name, a price on a line (a product) and a saved currency, then Save profile file
  const a = await browser.newPage();
  await a.goto("/profile");
  await a.locator("#profile-name").fill("Marta");
  await a.locator("#profile-name").press("Enter");
  await a.locator("#price-region").selectOption("ES-CN");
  await a.goto(`/recipes/${KOREAN}`);
  await toOneServing(a);
  const beef = a.locator("#pack-table-body tr").filter({ hasText: "ground beef" });
  await beef.locator("input").fill("4.99");
  await expect(beef).toContainText("€4.99");
  await a.goto("/profile");
  const [saved] = await Promise.all([a.waitForEvent("download"), a.getByRole("button", { name: "Save profile file" }).click()]);
  expect(saved.suggestedFilename()).toMatch(/^smartbite-profile-\d{4}-\d{2}-\d{2}\.json$/);
  const file = testInfo.outputPath("profile.json"); // a download is deleted when its page closes
  await saved.saveAs(file);
  const text = await (await import("node:fs/promises")).readFile(file, "utf8");
  expect(JSON.parse(text).data).not.toHaveProperty("apiKey");
  await a.close();

  // Browser B (fresh storage): its own name, then Open profile file
  const context = await browser.newContext();
  const b = await context.newPage();
  await b.goto("/profile");
  await b.locator("#profile-name").fill("Other");
  await b.locator("#profile-name").press("Enter");
  await b.locator("#profile-file-open").setInputFiles(file);
  const confirm = b.getByRole("alertdialog");
  await expect(confirm).toContainText("Replace this browser's profile with Marta's");
  await expect(confirm).toContainText("1 product");
  await expect(confirm).toContainText("your API key stays as it is");
  const [backup] = await Promise.all([b.waitForEvent("download"), confirm.getByRole("button", { name: "Replace" }).click()]);
  expect(backup.suggestedFilename()).toMatch(/^smartbite-profile-backup-/);
  const old = JSON.parse(await (await import("node:fs/promises")).readFile(await backup.path(), "utf8"));
  expect(old.data.name).toBe("Other");
  await expect(b.getByRole("heading", { level: 1 })).toHaveText("Marta's profile");
  await expect(b.locator("#price-region")).toHaveValue("ES-CN");
  await b.goto(`/recipes/${KOREAN}`);
  await toOneServing(b);
  await expect(b.locator("#pack-table-body tr").filter({ hasText: "ground beef" })).toContainText("€4.99");
  await context.close();
});

test("the country list is the supported countries plus Other, each with its supermarkets", async ({ page }) => {
  await page.goto("/profile");
  const country = page.locator("#price-country");
  await expect(country.locator("option")).toHaveText(["Australia", "Canada", "France", "Ireland", "Mexico", "Spain",
    "United Kingdom", "United States", "Other country"]);
  await country.selectOption("US");
  await expect(page.locator("#store option")).toHaveText(["No store", "Walmart", "Costco", "Kroger", "Albertsons / Safeway",
    "Publix", "Aldi", "Trader Joe's", "Whole Foods", "Other"]);
  await page.locator("#store").selectOption({ label: "Trader Joe's" });
  await page.reload();
  await expect(page.locator("#store")).toHaveValue("trader-joe-s-us");
  await country.selectOption("other");
  await expect(page.getByText("No estimated prices or supermarket list outside the listed countries")).toBeVisible();
  await expect(page.locator("#store option")).toHaveText(["No store", "Trader Joe's", "Other"]); // the saved store stays listed
  // A country saved before the list was limited reads as Other country and keeps its currency
  await page.evaluate(() => { localStorage.setItem("smartbite.country", JSON.stringify("SE")); localStorage.removeItem("smartbite.currency"); });
  await page.reload();
  await expect(country).toHaveValue("other");
  await expect(page.locator("#currency")).toHaveValue("SEK");
});

test("Canada gets estimated prices in CAD from Statistics Canada", async ({ page }) => {
  await page.goto("/profile");
  await page.locator("#price-country").selectOption("CA");
  await expect(page.locator("#currency")).toHaveValue("CAD");
  await expect(page.locator("#price-region option")).toHaveText(["Canada average", "Off: only my prices"]);
  await expect(page.getByText("the average price shoppers paid in Canada")).toContainText("Statistics Canada monthly average retail prices; 53 foods have one");
  await page.goto(`/recipes/${KOREAN}`);
  await toOneServing(page);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Prices marked est. are estimates (Canada average price paid, Statistics Canada, Sep 2025 to Aug 2026)")).toBeVisible();
  const beef = page.locator("#pack-table-body tr").filter({ hasText: "ground beef" });
  await expect(beef.getByText("est.")).toBeVisible();
  await expect(beef).toContainText("CA$");
  await expect(page.locator("#summary-bought-cost")).toContainText("CA$");

  await page.goto("/profile");
  await page.locator("#price-region").selectOption("off");
  await page.goto(`/recipes/${KOREAN}`);
  await toOneServing(page);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#pack-table-body").getByText("est.")).toHaveCount(0);
});

test("the United Kingdom gets estimated prices in GBP from the ONS", async ({ page }) => {
  await page.goto("/profile");
  await page.locator("#price-country").selectOption("GB");
  await expect(page.locator("#currency")).toHaveValue("GBP");
  await expect(page.locator("#price-region option")).toHaveText(["United Kingdom average", "Off: only my prices"]);
  await expect(page.getByText("the average price in the United Kingdom")).toContainText("ONS shopping prices comparison tool; 50 foods have one");
  await page.goto(`/recipes/${KOREAN}`);
  await toOneServing(page);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Prices marked est. are estimates (United Kingdom average price, ONS, Oct 2025 to Sep 2026)")).toBeVisible();
  const beef = page.locator("#pack-table-body tr").filter({ hasText: "ground beef" });
  await expect(beef.getByText("est.")).toBeVisible();
  await expect(beef).toContainText("£");
});

test("the United States gets estimated prices in USD from the BLS", async ({ page }) => {
  await page.goto("/profile");
  await page.locator("#price-country").selectOption("US");
  await expect(page.locator("#currency")).toHaveValue("USD");
  await expect(page.getByText("the average price in the United States")).toContainText("U.S. Bureau of Labor Statistics average prices; 18 foods have one");
  await page.goto(`/recipes/${KOREAN}`);
  await toOneServing(page);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Prices marked est. are estimates (United States average price, BLS, Oct 2025 to Sep 2026)")).toBeVisible();
  const beef = page.locator("#pack-table-body tr").filter({ hasText: "ground beef" });
  await expect(beef.getByText("est.")).toBeVisible();
  await expect(beef).toContainText("$");
});
