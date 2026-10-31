// Launch basics on the running dev server: link previews, icons, robots and sitemap, the 404 page, footer links,
// and that the home page loads no outside images and no hidden demo photos.
import { expect, test } from "@playwright/test";

const DEMO_SLUG = "tuna-frittata-with-vegetables";

test("home has link-preview tags and every image is served by the site", async ({ page, baseURL }) => {
  const outside = [];
  page.on("request", (r) => {
    if (r.resourceType() === "image" && !r.url().startsWith(`${baseURL}/`)) outside.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/opengraph-image\.png/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  expect(outside).toEqual([]);
});

test("home does not load the photos of hidden tabs", async ({ page }) => {
  const photos = new Set();
  page.on("request", (r) => { if (r.url().includes("/demo/images/")) photos.add(r.url()); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect(photos.size).toBe(0); // the real app has no demo meals
  await page.goto("/demo");
  await page.waitForLoadState("networkidle");
  // The demo home grid shows a handful of demo meals below the fold; My Recipes (hidden) holds all 13
  expect(photos.size).toBeLessThan(13);
});

test("demo recipe pages have their own preview title and photo", async ({ page }) => {
  await page.goto(`/recipes/${DEMO_SLUG}`);
  await expect(page).toHaveTitle(/^Tuna frittata with vegetables - SmartBite$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`/demo/images/${DEMO_SLUG}\\.jpg$`));
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /kcal and \d+ g protein per serving/);
});

test("robots, sitemap and icons answer", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Sitemap: ");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(`/recipes/${DEMO_SLUG}</loc>`);
  expect(await sitemap.text()).toContain("/demo</loc>");
  expect(await sitemap.text()).toContain("/start</loc>");
  for (const path of ["/favicon.ico", "/apple-icon.png", "/opengraph-image.png"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test("unknown pages show the SmartBite 404 with a way home", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to SmartBite" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("footer links to the source code and says it is not medical advice", async ({ page }) => {
  await page.goto("/privacy");
  const footer = page.locator("footer");
  await expect(footer.getByRole("link", { name: "Source code" })).toHaveAttribute("href", "https://github.com/MarianGarabana/SmartBite");
  await expect(footer).toContainText("Not medical advice.");
  await expect(page.getByRole("heading", { name: "Hosting and logs" })).toBeVisible();
});

test("security headers are set, and with the CSP on no page breaks a rule", async ({ page }) => {
  const violations = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  page.on("console", (m) => { if (m.text().startsWith("CSP violation")) violations.push(m.text()); });
  const res = await page.goto("/");
  const headers = res.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
  const csp = headers["content-security-policy"] || headers["content-security-policy-report-only"];
  test.skip(!csp, "dev server runs without SMARTBITE_CSP: start it with SMARTBITE_CSP=enforce to check the policy");
  expect(csp).toContain("connect-src 'self' https://api.anthropic.com");
  expect(csp).toContain("frame-ancestors 'none'");
  for (const path of ["/?tab=recipes", "/?tab=make-meal", "/?tab=cart", "/start", "/demo", "/demo?tab=make-meal", "/profile", "/privacy",
    `/recipes/${DEMO_SLUG}`]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});

test("the Cart's shopping list copies as text and prints without the site's header and buttons", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`/recipes/${DEMO_SLUG}`);
  await page.getByRole("button", { name: "Add to my cart" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("smartbite.demoCart") || "{}").meals?.length ?? 0)).toBe(1);
  await page.goto("/demo?tab=cart");
  const firstIngredient = page.locator("#cart-consolidated-tbody tr td").first();
  await expect(firstIngredient).toBeVisible();

  await page.getByRole("button", { name: "Copy list" }).click();
  await expect(page.locator("#toast-text")).toHaveText("Shopping list copied.");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toMatch(/^SmartBite shopping list\n\n- /);
  expect(text).toContain(`- ${await firstIngredient.innerText()}: `);

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header")).toBeHidden();
  await expect(page.locator("footer")).toBeHidden();
  await expect(page.locator("#cart-list-actions")).toBeHidden();
  await expect(page.locator("#cart-consolidated-tbody")).toBeVisible();
  await expect(page.locator("#cart-total-bought")).toBeVisible();
});
