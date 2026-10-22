// Profile (was Settings, decided 2026-10-22) on the running dev server (3100) with the real engine (8100). No model runs.
// 1. The old /settings link opens the Profile; a display name shows in the heading.
// 2. A country with another currency changes the price symbol everywhere and turns Spain's estimates off.
import { expect, test } from "@playwright/test";

const KOREAN = "korean-beef-bowl-with-peas-and-brown-rice-lentil-mix";

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
  await expect(page.locator("#pack-table-body").getByText("est.").first()).toBeVisible();
  await expect(page.locator("#summary-bought-cost")).toContainText("€");

  await page.goto("/profile");
  await page.locator("#price-country").selectOption("GB");
  await expect(page.locator("#currency")).toHaveValue("GBP");
  await page.goto(`/recipes/${KOREAN}`);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("#pack-table-body").getByText("est.")).toHaveCount(0); // estimates are in EUR
  await expect(page.locator("#summary-bought-cost")).toHaveText("No prices yet");
  const beef = page.locator("#pack-table-body tr").filter({ hasText: "ground beef" });
  await expect(beef.locator("input")).toHaveAttribute("placeholder", "£ / pack");
  await beef.locator("input").fill("4.99");
  await expect(beef).toContainText("£4.99");
  await expect(page.locator("#summary-bought-cost")).toContainText("£4.99");

  // Back to Spain but paying in pounds: estimates stay off; then euros brings them back
  await page.goto("/profile");
  await page.locator("#price-country").selectOption("ES");
  await expect(page.locator("#currency")).toHaveValue("EUR");
  await page.locator("#currency").selectOption("GBP");
  await expect(page.locator("#price-region")).toHaveCount(0);
  await page.locator("#currency").selectOption("EUR");
  await expect(page.locator("#price-region")).toBeVisible();
  await page.goto(`/?tab=make-meal`);
  await expect(page.getByText("Total budget (€)")).toBeVisible();
});
