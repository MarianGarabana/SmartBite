// The way in (decided 2026-10-31) on the running dev server (3100). No model runs.
// 1. /start offers Use my API key and Try the demo; with a full setup, Use my API key ends in Make Your Meal. The key
//    step offers Anthropic, Gemini, or "OpenAI or other" (set up in the Profile).
// 2. Inside the demo, Make Your Meal and the demo recipe pages lead to /start.
// 3. Phones: no sideways scroll on /start.
import { expect, test } from "@playwright/test";

const DEMO_SLUG = "tuna-frittata-with-vegetables";

test("Use my API key: the setup with a key ends in Make Your Meal", async ({ page }) => {
  await page.goto("/start");
  await expect(page.locator("#start-page h1")).toHaveText("Start SmartBite");
  await expect(page.locator("#start-ready")).toHaveCount(0);
  await page.locator("#start-key").getByRole("button", { name: "Use my API key" }).click();
  const setup = page.getByRole("dialog");
  await setup.getByRole("button", { name: "Next" }).click();
  await setup.locator("#setup-key").fill("sk-ant-test-key");
  await setup.getByRole("button", { name: "Save key" }).click();
  await setup.getByRole("button", { name: "Make Your Meal" }).click();
  await expect(page).toHaveURL(/\/\?tab=make-meal$/);
  await expect(page.locator("#input-craving")).toBeVisible();

  // Back on /start with a complete profile: a shortcut to Make Your Meal
  await page.goto("/start");
  await expect(page.locator("#start-ready")).toContainText("Your key is saved.");
});

test("the setup takes a Gemini key too, or sends other providers to the Profile", async ({ page }) => {
  await page.goto("/start");
  await page.locator("#start-key").getByRole("button", { name: "Use my API key" }).click();
  const setup = page.getByRole("dialog");
  await setup.getByRole("button", { name: "Next" }).click();
  await expect(setup.getByRole("radio", { name: "Anthropic (Claude)" })).toHaveAttribute("aria-checked", "true");

  // OpenAI or other: no key field here, a link to the Profile's AI card
  await setup.getByRole("radio", { name: "OpenAI or other" }).click();
  await expect(setup.locator("#setup-key")).toHaveCount(0);
  await expect(setup.getByRole("button", { name: "Save key" })).toHaveCount(0);
  await expect(setup.locator("#setup-other")).toContainText("Not tested by SmartBite yet");

  // Gemini: saved as the OpenAI-compatible Gemini preset, key under the OpenAI-compatible key
  await setup.getByRole("radio", { name: "Google Gemini" }).click();
  await expect(setup.getByLabel("Gemini API key")).toBeVisible();
  await expect(setup.getByRole("link", { name: /Google AI Studio/ })).toHaveAttribute("href", "https://aistudio.google.com/apikey");
  await setup.locator("#setup-key").fill("AIza-test-key");
  await setup.getByRole("button", { name: "Save key" }).click();
  await setup.getByRole("button", { name: "Make Your Meal" }).click();
  await expect(page).toHaveURL(/\/\?tab=make-meal$/);
  await expect(page.locator("#input-craving")).toBeVisible();
  const saved = await page.evaluate(() => ({ llm: JSON.parse(localStorage.getItem("smartbite.llm")),
    key: localStorage.getItem("smartbite.openaiKey"), anthropic: localStorage.getItem("smartbite.anthropicKey") }));
  expect(saved.llm.provider).toBe("openai_compatible");
  expect(saved.llm.openai).toEqual({ preset: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-3.8-flash" });
  expect(saved.key).toBe('"AIza-test-key"');
  expect(saved.anthropic).toBeNull();

  // Open again: Gemini and its key are shown; OpenAI or other leads to the Profile's AI card
  await page.goto("/start");
  await page.locator("#start-key").getByRole("button", { name: "Use my API key" }).click();
  await setup.getByRole("button", { name: "Next" }).click();
  await expect(setup.getByRole("radio", { name: "Google Gemini" })).toHaveAttribute("aria-checked", "true");
  await expect(setup.locator("#setup-key")).toHaveValue("AIza-test-key");
  await setup.getByRole("radio", { name: "OpenAI or other" }).click();
  await setup.locator("#setup-other").getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile#ai-provider$/);
  await expect(page.locator("#ai-provider")).toBeInViewport();
});

test("the demo's Make Your Meal and demo recipe pages lead to /start", async ({ page }) => {
  await page.goto("/demo?tab=make-meal");
  const bar = page.locator("#demo-make-bar");
  await expect(bar).toContainText("This is the demo.");
  await expect(page.locator("#input-craving")).toBeVisible(); // the demo form still works
  await bar.getByRole("link", { name: "Make a real one?" }).click();
  await expect(page).toHaveURL(/\/start$/);

  await page.goto(`/recipes/${DEMO_SLUG}`);
  const card = page.locator("#make-your-own");
  await expect(card).toContainText("Make your own");
  await card.getByRole("link", { name: "Make your own" }).click();
  await expect(page).toHaveURL(/\/start$/);

  // The real app has no demo bar
  await page.goto("/");
  await expect(page.locator("#demo-make-bar")).toHaveCount(0);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("no sideways scroll on /start", async ({ page }) => {
    await page.goto("/start");
    await expect(page.locator("#start-demo")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
