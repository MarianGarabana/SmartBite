// Recipe page prices and the Cart on the running dev server (3100) with the real engine (8100). No model runs.
// 1. Typing a price key by key keeps every keystroke and the table never falls back to the stored meal meanwhile.
// 2. The Cart uses the same engine evaluation as the recipe page: same packs, same estimates, same total.
// 3. The steps note and the MyFitnessPal block at 1 serving of a meal written for 8.
import { expect, test } from "@playwright/test";

const KOREAN = "korean-beef-bowl-with-peas-and-brown-rice-lentil-mix";
const table = (page) => page.locator("#pack-table-body");
const row = (page, food) => table(page).locator("tr").filter({ hasText: food });

// The recipe page has its engine reply (Spain estimates) once an "est." price shows
async function openKorean(page) {
  await page.goto(`/recipes/${KOREAN}`);
  await expect(table(page).getByText("est.").first()).toBeVisible();
}

test("a price typed key by key keeps every keystroke and the table never flashes back", async ({ page }) => {
  await openKorean(page);
  const beef = row(page, "ground beef");
  await expect(beef.locator("td").nth(2)).toHaveText("300g");
  const estimates = await table(page).getByText("est.").count();
  expect(estimates).toBeGreaterThan(0);

  // Watch the table while typing: any frame with the stored meal's 400 g pack or without estimates is a flash
  await page.evaluate(() => {
    window.__flash = [];
    const body = document.querySelector("#pack-table-body");
    new MutationObserver(() => {
      const r = [...body.querySelectorAll("tr")].find((tr) => tr.textContent.includes("ground beef"));
      const pack = r?.querySelectorAll("td")[2]?.textContent;
      if (pack !== "300g") window.__flash.push(`pack ${pack}`);
      if (!body.textContent.includes("est.")) window.__flash.push("no est.");
    }).observe(body, { subtree: true, childList: true, characterData: true });
  });

  const input = beef.locator("input");
  await input.click();
  await input.pressSequentially("4.99", { delay: 120 });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("4.99");
  // The price is saved as a product for the 300 g pack the line shows (no store picked: the no-store product)
  await expect.poll(() => page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("smartbite.products") || "{}")["none|ground beef"];
    return p && { pack_grams: p.pack_grams, price_eur: p.price_eur };
  })).toEqual({ pack_grams: 300, price_eur: 4.99 });
  await expect(beef).toContainText("€4.99");
  await page.waitForLoadState("networkidle");
  await expect(input).toBeFocused();
  expect(await page.evaluate(() => window.__flash)).toEqual([]);
});

test("the Cart shows the recipe page's packs, estimates and total", async ({ page }) => {
  await openKorean(page);
  await row(page, "ground beef").locator("input").fill("4.99");
  await expect(row(page, "ground beef")).toContainText("€4.99");
  await page.waitForLoadState("networkidle");
  // What the recipe page shows for 1 serving: per food the pack size, packs and price cell
  const read = (rows) => rows.evaluateAll((trs) => trs.map((tr) => {
    const td = [...tr.querySelectorAll("td")].map((c) => c.textContent.trim());
    return { food: td[0], pack: td[2], packs: td[3], needed: td[4], price: td[7].replace(/^.*?(€\S+)/, "$1") };
  }));
  const recipeRows = await read(table(page).locator("tr"));
  const recipeTotal = await page.locator("#summary-bought-cost").innerText();
  expect(recipeRows.find((r) => r.food === "ground beef").pack).toBe("300g");

  await page.getByRole("button", { name: "Add to my cart" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("smartbite.cart") || "{}").meals?.length ?? 0)).toBe(1);
  await page.locator("#nav-cart").click();
  await page.waitForURL(/tab=cart/);
  const cartBody = page.locator("#cart-consolidated-tbody");
  await expect(cartBody.getByText("est.").first()).toBeVisible();
  const cartRows = await read(cartBody.locator("tr"));
  expect(cartRows).toEqual(recipeRows);
  await expect(page.locator("#cart-total-bought")).toHaveText(recipeTotal);
});

test("steps say which servings they are written for, and MyFitnessPal has no 0 g lines", async ({ page }) => {
  await openKorean(page);
  await expect(page.locator("#servings-count")).toHaveText("1");
  await expect(page.locator("#steps-servings-note")).toHaveText(
    "Steps are written for 8 servings. The ingredient list shows the grams for 1 serving.");
  const mfp = page.locator("#mfp-text-block");
  await expect(mfp).toContainText("chili flakes, 0.3 g");
  await expect(mfp).toContainText("black pepper, 0.3 g (raw)");
  expect(await mfp.innerText()).not.toMatch(/, 0 g/);
});
