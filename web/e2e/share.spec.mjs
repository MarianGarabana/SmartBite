// Shareable recipe link (decided 2026-11-09). Runs on the dev server (3100) with the real engine (8100); no model is
// called. 1. Share recipe on a demo page copies a /r#... link under 2,000 characters. 2. A fresh browser with no key and
// no setup opens it as a normal recipe page labelled "Shared recipe", with macros and a working Save; opening it again
// opens the same meal. 3. A cut-off link says so. 4. On a phone the share menu gets the link.
import { devices, expect, test } from "@playwright/test";

const DEMO = "/recipes/tuna-frittata-with-vegetables";
const TITLE = "Tuna frittata with vegetables";
const BASE = "http://127.0.0.1:3100";

async function copyLink(page, context) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.goto(DEMO);
  await expect(page.locator("#picked-meal-title")).toHaveText(TITLE);
  await page.locator("#share-recipe").click();
  await expect(page.getByText("Link copied. It holds the recipe only, nothing about you.")).toBeVisible();
  return page.evaluate(() => navigator.clipboard.readText());
}

test("Share recipe copies a short /r link with the recipe after #", async ({ page, context }) => {
  const link = await copyLink(page, context);
  expect(link).toMatch(/^http:\/\/127\.0\.0\.1:3100\/r#[A-Za-z0-9_-]+$/);
  expect(link.length).toBeLessThan(2000);
});

test("a fresh browser with no key opens the link as a recipe page and can save it", async ({ page, context, browser }) => {
  const link = await copyLink(page, context);
  const demoKcal = Number(await page.locator("#tile-kcal").textContent());

  // Empty storage: no key, no setup, no meals (startSeen not set either: /r must not detour to /start)
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const other = await fresh.newPage();
  const errors = [];
  other.on("pageerror", (e) => errors.push(e.message));
  other.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await other.goto(link);
  await expect(other).toHaveURL(/\/recipes\/tuna-frittata-with-vegetables-shared-[a-z0-9]+$/);
  await expect(other.locator("#picked-meal-title")).toHaveText(TITLE);
  await expect(other.getByText("Shared recipe", { exact: true })).toBeVisible();
  expect(await other.evaluate(() => localStorage.getItem("smartbite.anthropicKey"))).toBeNull();
  const kcal = Number(await other.locator("#tile-kcal").textContent());
  expect(Math.abs(kcal - demoKcal) / demoKcal).toBeLessThan(0.1); // same recipe, same engine
  await expect(other.locator("#picked-ingredients-list li").first()).toBeVisible();
  await expect(other.locator("#pack-table-body tr").first()).toBeVisible();
  await expect(other.locator("#make-your-own")).toBeVisible(); // no setup yet: the way to make your own

  await other.getByRole("button", { name: "Save in my recipes" }).click();
  await expect(other.getByText(`Saved "${TITLE}" in My Recipes, in this browser.`)).toBeVisible();
  const slug = new URL(other.url()).pathname.split("/").pop();
  expect(await other.evaluate(() => JSON.parse(localStorage.getItem("smartbite.saved")))).toEqual([slug]);

  // The same link again opens the same meal, not a copy
  await other.goto(link);
  await expect(other).toHaveURL(new RegExp(`/recipes/${slug}$`));
  expect(Object.keys(await other.evaluate(() => JSON.parse(localStorage.getItem("smartbite.meals"))))).toEqual([slug]);
  expect(errors).toEqual([]);
  await fresh.close();
});

test("a cut-off link says it does not open a recipe", async ({ page, context }) => {
  const link = await copyLink(page, context);
  await page.goto(link.slice(0, link.length - 200));
  await expect(page.getByRole("heading", { name: "This link does not open a recipe" })).toBeVisible();
  await expect(page.getByRole("button", { name: "See example meals" })).toBeVisible();
});

test("on a phone, Share recipe opens the share menu with the link", async ({ browser }) => {
  const { defaultBrowserType: _b, ...pixel } = devices["Pixel 7"];
  const phone = await browser.newContext({ ...pixel, storageState: { cookies: [], origins: [] } });
  const page = await phone.newPage();
  await page.addInitScript(() => {
    window.__shared = [];
    navigator.share = async (data) => { window.__shared.push(data); };
  });
  await page.goto(DEMO);
  await page.locator("#share-recipe").click();
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
  const data = (await page.evaluate(() => window.__shared))[0];
  expect(data.title).toBe(TITLE);
  expect(data.url).toMatch(/\/r#[A-Za-z0-9_-]+$/);
  // no sideways scroll on the phone with the new button
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await phone.close();
});
