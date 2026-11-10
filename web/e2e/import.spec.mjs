// Paste a recipe (decided 2026-11-09, Q14), on the dev server (3100) with the real engine (8100). The AI provider is
// mocked with a reply a real model gave in the eval (eval/recipe_import/replies/v3-sonnet): no model runs.
// 1. My Recipes -> Paste a recipe -> Read recipe -> servings asked (the text states none) -> recipe page with the
//    editor open and the foods to check -> Save changes -> Save in my recipes. 2. With no key the box says so.
// 3. The demo has no button. 4. Phone: no sideways scroll with the button.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { devices, expect, test } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PASTE = fs.readFileSync(path.join(ROOT, "eval", "recipe_import", "pastes", "en-lentil-soup.txt"), "utf8");
const REPLY = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "recipe_import", "replies", "v3-sonnet", "en-lentil-soup.json"), "utf8")).reply;
const ANTHROPIC = "https://api.anthropic.com/v1/messages";
const FAKE_KEY = "sk-ant-e2e-fake-key-import";
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };

async function withKey(page) {
  await page.goto("/settings");
  await page.locator("#llm-provider").selectOption("anthropic");
  await page.locator("#api-key").fill(FAKE_KEY);
  await page.getByRole("button", { name: "Save provider and key" }).click();
  await page.evaluate(() => localStorage.setItem("smartbite.setup", JSON.stringify("done")));
}

async function mockModel(page, calls) {
  await page.route(ANTHROPIC, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = req.postDataJSON();
    calls.push({ key: req.headers()["x-api-key"], effort: body.output_config?.effort, system: body.system, user: body.messages[0].content });
    return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({
      id: "msg_import", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: JSON.stringify(REPLY) }],
      stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) });
  });
}

test("paste a recipe: read, pick servings, check in the editor, save", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const calls = [];
  await withKey(page);
  await mockModel(page, calls);
  await page.goto("/?tab=recipes");
  await page.locator("#paste-recipe").click();
  await expect(page.getByRole("heading", { name: "Paste a recipe" })).toBeVisible();
  await page.locator("#paste-text").fill(PASTE);
  await page.getByRole("button", { name: "Read recipe" }).click();

  // the text states no servings: asked once
  await expect(page.getByText("the recipe does not say how many servings it makes.")).toBeVisible();
  await page.locator("#paste-servings").fill("3");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/recipes\/lentil-soup-[a-z0-9]+\?edit=1$/);
  await expect(page.getByText("Imported recipe", { exact: true })).toBeVisible();
  const check = page.locator("#import-check");
  await expect(check).toContainText("Read from your pasted recipe");
  await expect(check).toContainText("bay leaf"); // not a known food: left out of macros
  // grams per serving = whole recipe / 3; the onion is weighed by code (1 medium = 110 g -> 36.7 g)
  await expect(page.getByLabel("onion grams per serving")).toHaveValue("36.7");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Meal saved.", { exact: true })).toBeVisible();
  await expect(page.locator("#tile-kcal")).not.toHaveText("");
  await expect(page.locator("#pack-table-body tr").first()).toBeVisible();
  await page.getByRole("button", { name: "Save in my recipes" }).click();
  await expect(page.getByText(/^Saved ".*" in My Recipes, in this browser\.$/)).toBeVisible();
  await expect(page.getByText("Imported recipe", { exact: true })).toBeVisible(); // kept after the edit
  await expect(page.getByText("Read by AI", { exact: true })).toBeVisible(); // the foods are the user's recipe
  await expect(page.getByText("AI read the foods and grams from the pasted recipe.", { exact: false })).toBeVisible();

  expect(calls).toHaveLength(1);
  expect(calls[0].key).toBe(FAKE_KEY);
  expect(calls[0].effort).toBe("medium");
  expect(calls[0].system).toMatch(/Recipe import agent/);
  expect(calls[0].user).toContain("1 onion, diced");
  const slug = new URL(page.url()).pathname.split("/").pop();
  const doc = await page.evaluate((s) => JSON.parse(localStorage.getItem("smartbite.meals"))[s], slug);
  expect(doc.imported).toBe(true);
  expect(doc.import_check).toBeUndefined(); // checked and saved
  expect(JSON.stringify(doc)).not.toContain(FAKE_KEY);
  expect(errors).toEqual([]);
});

test("paste a recipe with no AI key says to add one, and sends nothing", async ({ page }) => {
  const calls = [];
  await mockModel(page, calls);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("smartbite.setup", JSON.stringify("done")));
  await page.goto("/?tab=recipes");
  await page.locator("#paste-recipe").click();
  await expect(page.getByText("Reading a recipe uses your own AI key.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Add your key in your Profile" })).toHaveAttribute("href", "/profile");
  await expect(page.locator("#paste-text")).toHaveCount(0);
  expect(calls).toHaveLength(0);
});

test("a pasted link is caught with a hint, and nothing goes to the AI", async ({ page }) => {
  const calls = [];
  await withKey(page);
  await mockModel(page, calls);
  await page.goto("/?tab=recipes");
  await page.locator("#paste-recipe").click();
  await expect(page.getByText("Paste the text, not the link.", { exact: true })).toBeVisible();
  await page.locator("#paste-text").fill("https://www.bbcgoodfood.com/recipes/lentil-soup");
  await page.getByRole("button", { name: "Read recipe" }).click();
  await expect(page.locator("[role=dialog] [role=alert]")).toHaveText(/^That looks like a link\. SmartBite does not open websites/);
  expect(calls).toHaveLength(0);
});

test("the demo has no Paste a recipe button", async ({ page }) => {
  await page.goto("/demo?tab=recipes");
  await expect(page.locator("#recipes-grid > div").first()).toBeVisible();
  await expect(page.locator("#paste-recipe")).toHaveCount(0);
});

test("on a phone, My Recipes with the button has no sideways scroll and the box fits", async ({ browser }) => {
  const { defaultBrowserType: _b, ...phone } = devices["iPhone 13 Mini"];
  const ctx = await browser.newContext(phone);
  const page = await ctx.newPage();
  await withKey(page);
  await page.goto("/?tab=recipes");
  await expect(page.locator("#paste-recipe")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator("#paste-recipe").click();
  await expect(page.locator("#paste-text")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await ctx.close();
});
