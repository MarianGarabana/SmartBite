// The way in (decided 2026-10-31) on the running dev server (3100). No model runs.
// 1. /start offers Use my API key and Try the demo; with a full setup, Use my API key ends in Make Your Meal. The key
//    step offers Anthropic, Gemini, or "OpenAI or other" (set up in the Profile).
// 2. Inside the demo, Make Your Meal and the demo recipe pages lead to /start.
// 3. "I have a profile file" (decided 2026-11-01): a file with no key asks only for the key, a file with one goes
//    straight to Make Your Meal; the file can be dropped or chosen.
// 4. Phones: no sideways scroll on /start.
// 5. Front door (decided 2026-11-03): a browser with no SmartBite storage that opens "/" goes to /start, once.
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
    model: "gemini-3.6-flash" });
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

test.describe("front door", () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // a browser that never opened SmartBite

  test("a first visit to / opens /start once, then Home; Back leaves the site", async ({ page }) => {
    await page.goto("about:blank");
    await page.goto("/");
    await expect(page).toHaveURL(/\/start$/);
    await expect(page.locator("#start-page h1")).toHaveText("Start SmartBite");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("smartbite.startSeen"))).toBe("true");
    await page.goBack(); // replace(), not push: Back goes to where the visitor came from, not to /
    await expect(page).toHaveURL("about:blank");
    await page.goto("/");
    await expect(page).toHaveURL(/127\.0\.0\.1:3100\/$/);
    await expect(page.locator("#tab-home")).toBeVisible();
  });

  test("a tab link, another page or any SmartBite storage is never sent to /start", async ({ page }) => {
    await page.goto("/?tab=cart");
    await expect(page).toHaveURL(/\?tab=cart$/);
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/privacy$/);
    await page.goto("/demo");
    await expect(page.locator("#demo-banner")).toBeVisible();
    await page.evaluate(() => localStorage.setItem("smartbite.demoCart", JSON.stringify({ meals: [] })));
    await page.goto("/");
    await expect(page).toHaveURL(/127\.0\.0\.1:3100\/$/);
    await expect(page.locator("#tab-home")).toBeVisible();
  });

  test("Home never shows before the move to /start", async ({ page }) => {
    const painted = [];
    await page.exposeFunction("seenHome", (v) => painted.push(v));
    await page.addInitScript(() => {
      new MutationObserver(() => {
        const home = document.getElementById("tab-home");
        if (home && getComputedStyle(document.documentElement).visibility !== "hidden") window.seenHome?.(location.pathname);
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/");
    await expect(page).toHaveURL(/\/start$/);
    expect(painted.filter((p) => p === "/")).toEqual([]);
  });
});

const profileFile = (data) => ({ name: "smartbite-profile-2026-11-01.json", mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ app: "SmartBite", kind: "profile", version: 1, exported: "2026-11-01", data })) });

test("a profile file with no key opens on /start, asks only for the key, then Make Your Meal", async ({ page }) => {
  await page.goto("/start");
  await expect(page.locator("#start-file")).toContainText("I have a profile file");
  await page.locator("#start-file-open").setInputFiles(profileFile({ name: "Marta", country: "ES", region: "ES-MD", store: "mercadona" }));
  await expect(page.getByRole("alertdialog")).toHaveCount(0); // nothing to replace in a new browser: no confirm, no backup
  const setup = page.getByRole("dialog");
  await expect(setup).toContainText("Profile opened");
  await expect(setup).toContainText("Your AI key");
  await expect(setup).not.toContainText("Step 1 of 2");
  await expect(setup.getByRole("button", { name: "Back" })).toHaveCount(0);
  await setup.locator("#setup-key").fill("sk-ant-test-key");
  await setup.getByRole("button", { name: "Save key" }).click();
  await setup.getByRole("button", { name: "Make Your Meal" }).click();
  await expect(page.locator("#input-craving")).toBeVisible();
  const saved = await page.evaluate(() => ({ name: localStorage.getItem("smartbite.name"),
    store: localStorage.getItem("smartbite.store"), setup: localStorage.getItem("smartbite.setup") }));
  expect(saved).toEqual({ name: '"Marta"', store: '"mercadona"', setup: '"done"' });
});

test("closing the key step keeps the opened profile; it asks for the key again later", async ({ page }) => {
  await page.goto("/start");
  await page.locator("#start-file-open").setInputFiles(profileFile({ name: "Marta" }));
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  expect(await page.evaluate(() => localStorage.getItem("smartbite.setup"))).toBe('"done"');
  await page.goto("/?tab=make-meal");
  await expect(page).toHaveURL(/\/start$/); // no key yet
});

test("a dropped profile file with a key goes straight to Make Your Meal", async ({ page }) => {
  await page.goto("/start");
  const text = JSON.stringify({ app: "SmartBite", kind: "profile", version: 1, data: { name: "Marta", apiKey: "sk-ant-in-file" } });
  const dt = await page.evaluateHandle((t) => {
    const d = new DataTransfer();
    d.items.add(new File([t], "smartbite-profile.json", { type: "application/json" }));
    return d;
  }, text);
  await page.locator("#start-file-drop").dispatchEvent("drop", { dataTransfer: dt });
  await expect(page.locator("#input-craving")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("smartbite.anthropicKey"))).toBe('"sk-ant-in-file"');
});

test("a file that is not a profile shows why and changes nothing", async ({ page }) => {
  await page.goto("/start");
  await page.locator("#start-file-open").setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByText("This is not a SmartBite profile file.")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("smartbite.setup"))).toBeNull();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("no sideways scroll on /start", async ({ page }) => {
    await page.goto("/start");
    await expect(page.locator("#start-demo")).toBeVisible();
    await expect(page.locator("#start-file-drop")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
