// Records docs/images/demo.gif (story updated 2026-11-10):
//   1. The demo, as a new visitor sees it: /start -> Try the demo -> the Make Your Meal quiz -> 4 ideas -> a recipe
//      with its packs and estimated prices. The demo never calls a model.
//   2. Paste a recipe: needs a key, so the recording sets a fake one in the browser and answers the AI call with the
//      reply a real model (claude-sonnet-5-5) gave for the same text in the import eval
//      (eval/recipe_import/replies/v3-sonnet/en-lentil-soup.json). The engine, the piece weights and the editor are real.
// No real key is used and no model runs. Rerun it when the app's look or the demo meals change.
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
const ROOT = path.join(import.meta.dirname, "..", "..");
const PASTE = fs.readFileSync(path.join(ROOT, "eval", "recipe_import", "pastes", "en-lentil-soup.txt"), "utf8");
const REPLY = JSON.parse(fs.readFileSync(path.join(ROOT, "eval", "recipe_import", "replies", "v3-sonnet", "en-lentil-soup.json"), "utf8")).reply;
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };

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

// The AI call of part 2 gets the eval's real reply after a short wait; nothing leaves the browser for a model
await page.route("https://api.anthropic.com/v1/messages", async (route) => {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
  await new Promise((r) => setTimeout(r, 1500));
  return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify({
    type: "message", role: "assistant", content: [{ type: "text", text: JSON.stringify(REPLY) }], stop_reason: "end_turn", usage: {} }) });
});

// 1. The demo
await page.goto(BASE);
await page.locator("#start-demo").waitFor();
await page.mouse.move(480, 300);
await pause(page, 2500);
await clickOn(page, page.locator("#start-demo").getByRole("link", { name: "Try the demo" }));
await page.locator("#demo-banner").waitFor();
await pause(page, 1500);
await page.goto(`${BASE}/demo?tab=make-meal`); // at 960 px the menu folds into the phone menu
const quiz = page.locator("#make-step-1");
await quiz.getByText("Chicken", { exact: true }).waitFor();
await pause(page, 1200);
await clickOn(page, quiz.getByText("Chicken", { exact: true }));
await pause(page, 500);
await clickOn(page, quiz.getByText("Bowl", { exact: true }));
await pause(page, 1200);
const show = page.getByRole("button", { name: "Show me 4 ideas" });
for (let i = 0; i < 10 && !(await show.isVisible()); i++) {
  await clickOn(page, page.getByRole("button", { name: /^(Continue|Back to summary)/ }));
  await pause(page, 600);
}
await pause(page, 1000);
await clickOn(page, show);
const cards = page.locator("#ideas-card-grid > div");
await cards.first().waitFor();
await pause(page, 2500);
await clickOn(page, cards.first());
await pause(page, 1500);
await clickOn(page, page.getByRole("dialog").getByRole("button", { name: "Select meal" }));
await page.waitForURL(/\/recipes\//);
const table = page.locator("#pack-table-body");
await table.locator("tr").first().waitFor();
await page.mouse.move(480, 300, { steps: 10 });
await pause(page, 2500);
await scrollBy(page, 700);
await moveTo(page, table);
await pause(page, 3000);

// 2. Paste a recipe (a fake key in this browser only; the AI reply is the eval's)
await page.evaluate(() => {
  localStorage.setItem("smartbite.anthropicKey", JSON.stringify("sk-ant-demo-recording"));
  localStorage.setItem("smartbite.setup", JSON.stringify("done"));
});
await page.goto(`${BASE}/?tab=recipes`);
await page.locator("#paste-recipe").waitFor();
await pause(page, 1200);
await clickOn(page, page.locator("#paste-recipe"));
await page.locator("#paste-text").waitFor();
await pause(page, 800);
await page.locator("#paste-text").fill(PASTE);
await pause(page, 2000);
await clickOn(page, page.getByRole("button", { name: "Read recipe" }));
await page.locator("#paste-servings").waitFor();
await pause(page, 1500);
await page.locator("#paste-servings").fill("3");
await pause(page, 800);
await clickOn(page, page.getByRole("button", { name: "Continue" }));
await page.locator("#import-check").waitFor();
await page.mouse.move(480, 300, { steps: 10 });
await pause(page, 3500);
await clickOn(page, page.getByRole("button", { name: "Save changes" }));
await page.getByText("Imported recipe", { exact: true }).waitFor();
await page.mouse.move(480, 300, { steps: 10 });
await pause(page, 3000);

const video = page.video();
await context.close();
await browser.close();
const webm = await video.path();

// Two passes: a palette from the video, then the gif with it (sharper than one pass)
const palette = path.join(videoDir, "palette.png");
const filters = "fps=8,scale=860:-1:flags=lanczos"; // 8 fps and 860 px keep the gif well under 10 MB for GitHub
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-vf", `${filters},palettegen=stats_mode=diff`, palette]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", webm, "-i", palette,
  "-lavfi", `${filters}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`, OUT]);
fs.rmSync(videoDir, { recursive: true, force: true });
console.log(`wrote ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB) from ${BASE}`);
