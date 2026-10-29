// Makes the link-preview picture and the app icons from HTML, with the site's fonts and colors:
//   app/opengraph-image.png (1200 x 630), app/apple-icon.png (180 x 180), app/favicon.ico (32 x 32)
//
//   node scripts/make-share-images.mjs
//
// Rerun it when the hero text, the hero photo or app/icon.svg change. Fonts load from Google Fonts while it runs.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const WEB = path.join(import.meta.dirname, "..");
const APP = path.join(WEB, "app");
const FONTS = "https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Playfair+Display:wght@700" +
  "&family=Plus+Jakarta+Sans:wght@400;600&display=block";
const dataUri = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
const hero = dataUri(path.join(WEB, "public", "img", "hero-bowl.jpg"), "image/jpeg");
const icon = dataUri(path.join(APP, "icon.svg"), "image/svg+xml");

// Same words and look as the home hero
const OG = `<!doctype html><html><head><link rel="stylesheet" href="${FONTS}"><style>
  body { margin: 0; width: 1200px; height: 630px; background: #0f2d24; color: #f9f8f3; font-family: "Plus Jakarta Sans";
    display: flex; align-items: center; overflow: hidden; position: relative; }
  .glow { position: absolute; top: -160px; right: -160px; width: 520px; height: 520px; border-radius: 50%;
    background: rgba(112, 224, 0, .1); filter: blur(60px); }
  .text { padding-left: 80px; width: 640px; position: relative; }
  .chip { display: inline-block; padding: 8px 18px; border-radius: 999px; background: #184236; border: 1px solid rgba(112,224,0,.3);
    color: #70e000; font-size: 20px; font-weight: 600; letter-spacing: .04em; }
  h1 { font-family: "Playfair Display"; font-size: 68px; line-height: 1.1; color: #fff; margin: 28px 0 22px; }
  h1 .script { font-family: Caveat; color: #70e000; font-size: 84px; display: block; transform: rotate(-2deg); margin: -6px 0; }
  p { font-size: 24px; line-height: 1.45; color: rgba(249,248,243,.85); margin: 0; }
  .brand { position: absolute; left: 80px; bottom: 40px; display: flex; align-items: center; gap: 12px;
    font-family: "Playfair Display"; font-size: 28px; color: #fff; }
  .brand img { width: 40px; height: 40px; }
  .photo { position: absolute; right: 70px; top: 115px; width: 400px; height: 400px; }
  .photo .disc { position: absolute; inset: -10px; background: #70e000; border-radius: 50%; transform: rotate(-6deg); }
  .photo img { position: relative; width: 100%; height: 100%; object-fit: cover; border-radius: 50%; border: 10px solid #0f2d24;
    box-sizing: border-box; }
</style></head><body>
  <div class="glow"></div>
  <div class="text">
    <span class="chip">Whole-pack meal planner</span>
    <h1>Meals that fit <span class="script">your macros</span>and your budget.</h1>
    <p>A recipe in grams, a shopping list in whole packs, and macros worked out in code.</p>
  </div>
  <div class="brand"><img src="${icon}" alt="">SmartBite</div>
  <div class="photo"><div class="disc"></div><img src="${hero}" alt=""></div>
</body></html>`;

// The apple icon gets a full forest square: iOS rounds the corners itself and shows clear ones as black
const ICON = (size, bg = "transparent") => `<!doctype html><html><head><link rel="stylesheet" href="${FONTS}"><style>
  body { margin: 0; width: ${size}px; height: ${size}px; background: ${bg}; } img { width: 100%; height: 100%; display: block; }
</style></head><body><img src="${icon}" alt=""></body></html>`;

// A .ico file may hold a PNG as its one image (every current browser reads it)
function icoFromPng(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4); // reserved, type icon, 1 image
  head.writeUInt8(size, 6); head.writeUInt8(size, 7); // width, height
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); // planes, bits per pixel
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18); // image size, offset
  return Buffer.concat([head, png]);
}

async function shot(browser, html, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png", omitBackground: true });
  await page.close();
  return png;
}

const browser = await chromium.launch();
fs.writeFileSync(path.join(APP, "opengraph-image.png"), await shot(browser, OG, 1200, 630));
fs.writeFileSync(path.join(APP, "apple-icon.png"), await shot(browser, ICON(180, "#0f2d24"), 180, 180));
fs.writeFileSync(path.join(APP, "favicon.ico"), icoFromPng(await shot(browser, ICON(32), 32, 32), 32));
await browser.close();
console.log("wrote app/opengraph-image.png, app/apple-icon.png, app/favicon.ico");
