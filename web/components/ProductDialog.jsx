"use client";
// The product cell of a shopping row (recipe page and Cart) and the "Edit product" dialog (decided 2026-10-21).
// A product is what the user buys for one food at their store: name, pack size, price and, if they want, the label
// per 100 g. It is kept in this browser (lib/store.js) and replaces the typical pack and the nutrition table for
// that food. A barcode can fill name, pack size and label from Open Food Facts (lib/off.js); the user then ticks that
// the pack size is right before saving. Styles from the idea preview dialog and the Settings fields (design freeze).
import { useState } from "react";
import { EGG_GRAMS } from "../lib/cartmath";
import { foodName, getLang, t, tx, useLang } from "../lib/i18n";
import { LookupError, lookupBarcode } from "../lib/off";
import { moneySymbol } from "./Chrome";
import { COUNTRIES, ESTIMATES, NO_STORE, OTHER_COUNTRY, deleteProduct, okProduct, readCountry, readProducts, readStore, regionLabel,
  saveProduct } from "../lib/store";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2";
const input = "w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest";
const small = "block text-[11px] text-forest/70 mt-1";

const NUTRITION = { label: "your label", ciqual: "Ciqual", usda: "USDA", open_food_facts: "Open Food Facts" };
const nutritionText = (source) => (source === "label" ? t("your label") : NUTRITION[source] || null);
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayText = (d) => {
  const [y, m, day] = String(d || "").split("-").map(Number);
  return y && m >= 1 && m <= 12 && day ? `${day} ${t(MONTH[m - 1])} ${y}` : null;
};

// Estimated prices in the page language: lib/meal.js estimateTitle, estimateLabel and periodText run on the server
// too (demo meals), so they stay English; these give the same English text and the Spanish one (lib/i18n.js)
const monthText = (ym) => {
  const [y, m] = String(ym || "").split("-").map(Number);
  return y && m >= 1 && m <= 12 ? `${t(MONTH[m - 1])} ${y}` : null;
};
export function periodText(from, to) {
  const [a, b] = to === undefined ? String(from || "").split("/") : [from, to];
  const [x, y] = [monthText(a), monthText(b)];
  return x && y ? t("{from} to {to}", { from: x, to: y }) : null;
}
// A country's name: English from lib/store.js, Spanish from the browser's own list of country names
export function countryText(id) {
  if (id === OTHER_COUNTRY) return t("Other country");
  if (getLang() === "es" && /^[A-Z]{2}$/.test(id || "")) {
    try {
      return new Intl.DisplayNames(["es"], { type: "region" }).of(id) || id;
    } catch {}
  }
  return COUNTRIES.find((c) => c.id === id)?.label || id;
}
export const estimateLabel = (period, region, country = readCountry()) => {
  const e = ESTIMATES[country] || ESTIMATES.ES;
  return t("{place} {kind}, {source}, {period}", { place: regionLabel(region) || countryText(country), kind: t(e.kind),
    source: e.source, period: periodText(period) || t("latest 12 months") });
};
export const estimateTitle = (period, region, country) => t("Estimated: {label}", { label: estimateLabel(period, region, country) });

// "Macros: Ciqual · Price: estimate (MAPA)": where a row's numbers come from (the source of the user's country)
export function sourceText(row) {
  const macros = nutritionText(row.nutritionSource);
  const date = dayText(row.priceDate);
  const source = `${(ESTIMATES[readCountry()] || ESTIMATES.ES).source}${row.priceRegion ? `, ${regionLabel(row.priceRegion)}` : ""}`;
  const price = row.estimate ? t("estimate ({source})", { source }) : row.hasPrice ? (date ? t("yours, {date}", { date }) : t("yours"))
    : t("none yet");
  // A name the food table does not have, counted as the closest food (engine counted_as): "Macros: Ciqual, counted as
  // pork loin"
  const macroLine = macros && (row.countedAs ? t("Macros: {source}, counted as {food}", { source: macros, food: foodName(row.countedAs) })
    : t("Macros: {source}", { source: macros }));
  return [macroLine, t("Price: {price}", { price })].filter(Boolean).join(" · ");
}

// A row's product name in the page language. With no product of the user's, the engine names the typical pack after
// the English food ("zucchini, loose (196 g)", "canned tuna in water 168 g", smartbite_engine/generic_packs.py): in
// Spanish the food part shows its Spanish name. A product the user saved or imported keeps its name exactly.
export function productText(row) {
  const name = row.product;
  if (!name || row.userProduct || getLang() !== "es" || !row.foodKey || !name.startsWith(row.foodKey)) return name;
  const rest = name.slice(row.foodKey.length);
  const loose = /^, loose \((.+)\)$/.exec(rest);
  return `${foodName(row.foodKey)}${loose ? t(", loose ({grams})", { grams: loose[1] }) : rest}`;
}

// Product name, where its numbers come from, and "Edit product" for rows with a known food
export function ProductCell({ row, onEdit }) {
  useLang();
  return (
    <>
      <span className="block">{productText(row) || t("Typical pack")}</span>
      <span className="block max-sm:hidden text-[10px] text-forest/70 mt-0.5">
        {row.userProduct ? <span className="font-bold text-lime-hover">{t("Your product · ")}</span> : null}
        {sourceText(row)}
      </span>
      <EditProductButton row={row} onEdit={onEdit} />
    </>
  );
}

// "Edit product" under a row's product; also on rows with no pack size yet (a food the app does not know), where a
// product with a label makes it count (decided 2026-11-14)
export function EditProductButton({ row, onEdit }) {
  useLang();
  return row.foodKey && onEdit ? (
    <button type="button" onClick={() => onEdit(row)} aria-label={t("Edit product for {food}", { food: foodName(row.ingredient) })}
      className="text-[10px] font-bold text-forest/70 hover:text-lime-hover mt-0.5">
      <i className="fa-solid fa-pen mr-1"></i>{t("Edit product")}
    </button>
  ) : null;
}

// Open Food Facts lookup errors in the page language (lib/off.js stays plain: next.config.mjs reads it too)
function lookupText(message) {
  const status = /^Open Food Facts answered (\d+)\. Fill the fields by hand\.$/.exec(message);
  return status ? t("Open Food Facts answered {status}. Fill the fields by hand.", { status: status[1] }) : t(message);
}

// "2,5" and "2.5" are 2.5; "" is null; anything else NaN
function num(text) {
  const t = String(text ?? "").trim().replace(",", ".");
  if (!t) return null;
  return /^\d+(\.\d*)?$|^\.\d+$/.test(t) ? Number(t) : NaN;
}

const str = (v) => (v == null ? "" : String(v));
const LABEL_FIELDS = [["kcal", "kcal"], ["protein_g", "Protein (g)"], ["carbs_g", "Carbs (g)"], ["fat_g", "Fat (g)"],
  ["fiber_g", "Fiber (g)"], ["salt_g", "Salt (g)"]];
const REQUIRED = ["kcal", "protein_g", "carbs_g", "fat_g"];

// Label checks that warn and never block (decided 2026-10-21): kcal far from 4 x protein + 4 x carbs + 9 x fat, or
// more than 100 g of protein, carbs and fat in 100 g
export function labelWarnings(l) {
  if (!REQUIRED.every((k) => typeof l[k] === "number")) return [];
  const out = [];
  const fromMacros = 4 * l.protein_g + 4 * l.carbs_g + 9 * l.fat_g;
  if (l.kcal > 0 && Math.abs(l.kcal - fromMacros) / l.kcal > 0.15) {
    out.push(t("kcal is {kcal}, but protein, carbs and fat add up to about {sum} kcal.", { kcal: Math.round(l.kcal), sum: Math.round(fromMacros) }));
  }
  if (l.protein_g + l.carbs_g + l.fat_g > 100) out.push(t("Protein, carbs and fat add up to more than 100 g per 100 g."));
  return out;
}

// The product the dialog starts from: the one for this store, else the no-store one, else the pack the row shows
function startFrom(row, store) {
  const products = readProducts();
  const own = products[`${store}|${row.foodKey}`];
  const p = own || products[`${NO_STORE}|${row.foodKey}`];
  if (p) return { own: !!own, p };
  const eggs = row.soldBy === "per_unit";
  return { own: false, p: { food: row.foodKey, name: row.product || row.ingredient, sold_by: row.soldBy || "pack",
    ...(eggs ? { units_per_pack: row.unitsPerPack || Math.round(row.packSize / EGG_GRAMS) } : { pack_grams: row.packSize }),
    ...(row.hasPrice && !row.estimate ? { price_eur: row.packPrice } : {}) } };
}

export function ProductDialog({ row, onClose, showToast }) {
  useLang();
  const [store] = useState(readStore);
  const [{ own, p }] = useState(() => startFrom(row, store));
  const eggs = p.sold_by === "per_unit";
  const [form, setForm] = useState({
    name: p.name, sold_by: p.sold_by, size: str(eggs ? p.units_per_pack : p.pack_grams), price: str(p.price_eur),
    barcode: str(p.barcode), ...Object.fromEntries(LABEL_FIELDS.map(([k]) => [k, str(p.per_100g?.[k])])),
  });
  // Label filled by Open Food Facts and not edited since; pack size filled by it and not yet checked by the user
  const [fromOff, setFromOff] = useState(p.label_source === "open_food_facts");
  const [packCheck, setPackCheck] = useState(null); // null: nothing to check; false: to tick; true: ticked
  const [lookup, setLookup] = useState(null); // { loading } | { found, text, url, note } | { error }
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (LABEL_FIELDS.some(([f]) => f === k)) setFromOff(false);
    if (k === "size" && packCheck === false) setPackCheck(true); // typing the size is checking it
  };
  const findBarcode = async () => {
    setLookup({ loading: true });
    let got;
    try {
      got = await lookupBarcode(form.barcode);
    } catch (e) {
      return setLookup({ error: e instanceof LookupError ? lookupText(e.message) : t("The lookup failed. Fill the fields by hand.") });
    }
    if (!got) return setLookup({ error: t("This barcode is not on Open Food Facts. Fill the fields by hand.") });
    const size = eggs ? got.eggs : got.packGrams;
    const hasLabelData = REQUIRED.every((k) => got.per_100g[k] != null);
    setForm((f) => ({ ...f, name: got.name || f.name, size: size != null ? str(size) : f.size,
      ...(hasLabelData ? Object.fromEntries(LABEL_FIELDS.map(([k]) => [k, str(got.per_100g[k])])) : {}) }));
    setFromOff(hasLabelData);
    setPackCheck(false);
    const note = size == null ? (eggs ? t("It does not say how many eggs: add the eggs per box.") : t("It has no pack size: add it in grams."))
      : got.packFromMl ? t("The pack is {ml} ml: change it to grams if your food is heavier or lighter than water.", { ml: got.packGrams })
      : null;
    const found = `${got.name ? ` "${got.name}"` : ""}${got.quantity ? `, ${got.quantity}` : ""}`;
    setLookup({ found: true, url: `https://world.openfoodfacts.org/product/${form.barcode.trim()}`, note,
      text: `${t("Found{product}.", { product: found })}${hasLabelData ? "" : ` ${t("No full label there: fill it from your pack.")}`}` });
  };
  const label100 = Object.fromEntries(LABEL_FIELDS.map(([k]) => [k, num(form[k])]));
  const hasLabel = REQUIRED.some((k) => label100[k] != null);
  const warnings = hasLabel ? labelWarnings(label100) : [];

  const save = () => {
    const size = num(form.size);
    const price = num(form.price);
    if (!form.name.trim()) return showToast(t("Add the product name first."));
    if (!(size > 0)) return showToast(eggs ? t("Add how many eggs come in one box.") : t("Add the pack size in grams."));
    if (packCheck === false) return showToast(eggs ? t("Check the eggs per box against your pack, then tick the box.") : t("Check the pack size against your pack, then tick the box."));
    if (Number.isNaN(price)) return showToast(t("The price is not a number."));
    if (form.barcode.trim() && !/^\d{8,14}$/.test(form.barcode.trim())) return showToast(t("A barcode has 8 to 14 digits."));
    if (hasLabel && !REQUIRED.every((k) => label100[k] != null && !Number.isNaN(label100[k]))) {
      return showToast(t("Fill kcal, protein, carbs and fat from the label, or leave all four empty."));
    }
    const per100 = hasLabel ? Object.fromEntries(Object.entries(label100).filter(([, v]) => v != null && !Number.isNaN(v))) : null;
    const product = { food: row.foodKey, name: form.name, sold_by: form.sold_by,
      ...(eggs ? { units_per_pack: size } : { pack_grams: size }),
      ...(price != null ? { price_eur: price, price_date: price === p.price_eur && p.price_date ? p.price_date
        : new Date().toISOString().slice(0, 10) } : {}),
      ...(form.barcode.trim() ? { barcode: form.barcode.trim() } : {}), ...(per100 ? { per_100g: per100 } : {}),
      ...(per100 && fromOff ? { label_source: "open_food_facts" } : {}) };
    if (!okProduct(product)) return showToast(t("Some numbers are out of range. Check the pack size, price and label."));
    if (!saveProduct(store, product)) return showToast(t("Not saved: this browser blocks storage."));
    showToast(t("Product saved."));
    onClose();
  };
  const remove = () => {
    if (!deleteProduct(store, row.foodKey)) return showToast(t("Not saved: this browser blocks storage."));
    showToast(t("Product removed. This food uses typical packs again."));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-forest/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-8 shadow-card border border-cream-dark max-w-lg w-full space-y-6 max-h-[90vh] overflow-y-auto">
        <div>
          <span className="font-script text-2xl text-forest font-bold">{t("Your product")}</span>
          <h2 id="product-dialog-title" className="font-serif text-3xl font-bold text-forest leading-snug">{t("Your product for {food}", { food: foodName(row.ingredient) })}</h2>
          <p className="text-xs text-forest/70 mt-1">{hasLabel ? t("Saved in this browser. It replaces the typical pack and the nutrition table for this food in every meal.")
            : t("Saved in this browser. It replaces the typical pack for this food in every meal.")}</p>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="product-name" className={label}>{t("Product name")}</label>
            <input id="product-name" value={form.name} onChange={set("name")} maxLength={120} className={input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {eggs ? (
              <div>
                <label htmlFor="product-size" className={label}>{t("Eggs per box")}</label>
                <input id="product-size" inputMode="numeric" value={form.size} onChange={set("size")} className={input} />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="product-sold-by" className={label}>{t("Sold as")}</label>
                  <select id="product-sold-by" value={form.sold_by} onChange={set("sold_by")} className={input}>
                    <option value="pack">{t("Pack")}</option>
                    <option value="per_kg">{t("Loose, by weight")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="product-size" className={label}>{form.sold_by === "per_kg" ? t("Unit you buy (g)") : t("Pack size (g)")}</label>
                  <input id="product-size" inputMode="decimal" value={form.size} onChange={set("size")} className={input} />
                </div>
              </>
            )}
            <div>
              <label htmlFor="product-price" className={label}>{form.sold_by === "per_kg" ? t("Price ({symbol}) per unit", { symbol: moneySymbol() }) : t("Price ({symbol}) per pack", { symbol: moneySymbol() })}</label>
              <input id="product-price" inputMode="decimal" value={form.price} onChange={set("price")} placeholder={t("optional")} className={input} />
            </div>
            <div>
              <label htmlFor="product-barcode" className={label}>{t("Barcode")}</label>
              <input id="product-barcode" inputMode="numeric" value={form.barcode} onChange={set("barcode")} placeholder={t("optional")} maxLength={14} className={input} />
              <button type="button" onClick={findBarcode} disabled={!/^\d{8,14}$/.test(form.barcode.trim()) || lookup?.loading}
                className="text-[11px] font-bold text-forest/70 hover:text-lime-hover disabled:text-forest/30 mt-1">
                <i className="fa-solid fa-barcode mr-1"></i>{lookup?.loading ? t("Looking up...") : t("Look up on Open Food Facts")}
              </button>
            </div>
          </div>
          {lookup && !lookup.loading && (
            <div role="status" className={`text-xs rounded-xl p-3 space-y-1 ${lookup.error ? "bg-amber-100 text-amber-900" : "bg-cream text-forest"}`}>
              {lookup.error ? <span className="block">{lookup.error}</span> : (
                <>
                  <span className="block font-bold">{lookup.text}</span>
                  {lookup.note && <span className="block">{lookup.note}</span>}
                  <span className="block">{tx("Check the pack size and the label against your pack. Data from {off}, ODbL.", { off: <a href={lookup.url} target="_blank" rel="noopener noreferrer" className="underline">Open Food Facts</a> })}</span>
                </>
              )}
            </div>
          )}
          {packCheck !== null && (
            <label className="flex items-center gap-2 text-xs font-bold text-forest">
              <input id="product-pack-check" type="checkbox" checked={packCheck} onChange={(e) => setPackCheck(e.target.checked)} className="accent-lime w-4 h-4" />
              {eggs ? t("The eggs per box match my pack") : t("The pack size matches my pack")}
            </label>
          )}
          <div>
            <span className={label}>{t("Label, per 100 g")}</span>
            <div className="grid grid-cols-3 gap-3">
              {LABEL_FIELDS.map(([k, name]) => (
                <div key={k}>
                  <label htmlFor={`product-${k}`} className="block text-[11px] font-bold text-forest/70 mb-1">{t(name)}</label>
                  <input id={`product-${k}`} inputMode="decimal" value={form[k]} onChange={set(k)} className={input} />
                </div>
              ))}
            </div>
            <span className={small}>{fromOff && hasLabel ? t("From Open Food Facts. Edit any number to make it your own label.")
              : t("Optional. Fill kcal, protein, carbs and fat to use your label instead of the nutrition table; fiber and salt can stay empty.")}</span>
            {warnings.length > 0 && (
              <div role="status" className="mt-3 bg-amber-100 text-amber-900 text-xs rounded-xl p-3 space-y-1">
                <span className="block font-bold">{t("Check the label")}</span>
                {warnings.map((w) => <span key={w} className="block">{w}</span>)}
                <span className="block">{t("You can still save it.")}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={save} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">{t("Save product")}</button>
          <button onClick={onClose} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2.5">{t("Cancel")}</button>
          {own && (
            <button onClick={remove} className="text-xs font-bold text-forest/70 hover:text-red-600 px-3 py-2.5 ml-auto">{t("Remove product")}</button>
          )}
        </div>
      </div>
    </div>
  );
}
