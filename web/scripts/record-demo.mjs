// Records docs/images/demo.gif: Home -> My Recipes -> Korean beef bowl (packs, a typed price) -> Cart -> Adjust
// leftovers. Demo data only, no model call, no key. Rerun it whenever the demo numbers change.
//
//   node scripts/record-demo.mjs [base URL] [output gif]
//
// Defaults: the live demo and ../docs/images/demo.gif. Needs ffmpeg on the PATH (video -> gif).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE = (process.argv[2] || "https://smartbite-steel.vercel.app").replace(/\/$/, "");
const OUT = path.resolve(process.argv[3] || path.join(import.meta.dirname, "..", "..", "docs", "images", "demo.gif"));
const SIZE = { width: 960, height: 600 };
const KOREAN = "Korean beef bowl with peas and brown rice-lentil mix";

// Video has no mouse pointer, so the page draws one that follows the mouse
const CURSOR = `
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.style.cssText = "position:fixed;z-index:99999;pointer-events:none;width:14px;height:14px;border-radius:50%;" +
      "background:rgba(15,45,36,.85);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);" +
      "transform:translate(-50%,-50%);left:-20px;top:-20px";
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
  });`;

const pause = (page, ms) => page.waitForTimeout(ms);

async function moveTo(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 20 });
  await pause(page, 300);
}

async function clickOn(page, locator) {
  await moveTo(page, locator);
  await locator.click();
}

async function scrollBy(page, dy) {
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel(0, dy / 10);
    await pause(page, 40);
  }
}

const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), "smartbite-demo-"));
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: videoDir, size: SIZE } });
await context.addInitScript(CURSOR);
const page = await context.newPage();

await page.goto(BASE);
await page.mouse.move(480, 300);
await pause(page, 2500);

await clickOn(page, page.locator("#nav-recipes"));
await pause(page, 1500);
await clickOn(page, page.getByRole("link", { name: KOREAN }).first());
const table = page.locator("#pack-table-body");
await table.getByText("est.").first().waitFor();
await page.mouse.move(480, 300, { steps: 10 });
await pause(page, 3000);

await scrollBy(page, 700);
await moveTo(page, table);
await pause(page, 1500);
const beefPrice = table.locator("tr").filter({ hasText: "ground beef" }).locator("input");
await clickOn(page, beefPrice);
await beefPrice.pressSequentially("4.99", { delay: 200 });
await pause(page, 2500);

await clickOn(page, page.getByRole("button", { name: "Add to my cart" }));
await pause(page, 1200);
await clickOn(page, page.locator("#nav-cart"));
const cart = page.locator("#tab-cart");
await cart.getByRole("heading", { name: "Consolidated Shopping List" }).waitFor();
await pause(page, 2500);

await moveTo(page, cart.getByRole("heading", { name: "Your Leftovers" }));
await pause(page, 1500);
await clickOn(page, cart.getByRole("button", { name: "Adjust leftovers to meals" }));
await pause(page, 2500);
const apply = cart.getByRole("button", { name: "Apply" });
if (await apply.count()) {
  await clickOn(page, apply.first());
  await pause(page, 2500);
}

const video = page.video();
await context.close();
await browser.close();
const webm = await video.path();

// Two passes: a palette from the video, then the gif with it (sharper than one pass)
const palette = path.join(videoDir, "palette.png");
const filters = "fps=10,scale=960:-1:flags=lanczos";
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-vf", `${filters},palettegen=stats_mode=diff`, palette]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-i", palette,
  "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`, OUT]);
fs.rmSync(videoDir, { recursive: true, force: true });
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB) from ${BASE}`);
