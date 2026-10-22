"use client";
// The product cell of a shopping row (recipe page and Cart) and the "Edit product" dialog (decided 2026-10-21).
// A product is what the user buys for one food at their store: name, pack size, price and, if they want, the label
// per 100 g. It is kept in this browser (lib/store.js) and replaces the typical pack and the nutrition table for
// that food. A barcode can fill name, pack size and label from Open Food Facts (lib/off.js); the user then ticks that
// the pack size is right before saving. Styles from the idea preview dialog and the Settings fields (design freeze).
import { useState } from "react";
import { EGG_GRAMS } from "../lib/cartmath";
import { LookupError, lookupBarcode } from "../lib/off";
import { moneySymbol } from "./Chrome";
import { NO_STORE, deleteProduct, okProduct, readProducts, readStore, regionLabel, saveProduct, storeLabel } from "../lib/store";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-2";
const input = "w-full bg-cream/50 border border-cream-dark rounded-xl p-3 text-sm text-forest font-bold focus:outline-none focus:border-forest";
const small = "block text-[11px] text-forest/60 mt-1";

const NUTRITION = { label: "your label", ciqual: "Ciqual", usda: "USDA", open_food_facts: "Open Food Facts" };
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayText = (d) => {
  const [y, m, day] = String(d || "").split("-").map(Number);
  return y && m >= 1 && m <= 12 && day ? `${day} ${MONTH[m - 1]} ${y}` : null;
};

// "Macros: Ciqual · Price: estimate (MAPA)": where a row's numbers come from
export function sourceText(row) {
  const macros = NUTRITION[row.nutritionSource] || null;
  const date = dayText(row.priceDate);
  const price = row.estimate ? `estimate (MAPA${row.priceRegion ? `, ${regionLabel(row.priceRegion)}` : ""})` : row.hasPrice ? `yours${date ? `, ${date}` : ""}` : "none yet";
  return [macros && `Macros: ${macros}`, `Price: ${price}`].filter(Boolean).join(" · ");
}

// Product name, where its numbers come from, and "Edit product" for rows with a known food
export function ProductCell({ row, onEdit }) {
  return (
    <>
      <span className="block">{row.product || "Typical pack"}</span>
      <span className="block text-[10px] text-forest/50 mt-0.5">
        {row.userProduct ? <span className="font-bold text-lime-hover">Your product · </span> : null}
        {sourceText(row)}
      </span>
      {row.foodKey && onEdit ? (
        <button type="button" onClick={() => onEdit(row)} aria-label={`Edit product for ${row.ingredient}`}
          className="text-[10px] font-bold text-forest/60 hover:text-lime-hover mt-0.5">
          <i className="fa-solid fa-pen mr-1"></i>Edit product
        </button>
      ) : null}
    </>
  );
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
    out.push(`kcal is ${Math.round(l.kcal)}, but protein, carbs and fat add up to about ${Math.round(fromMacros)} kcal.`);
  }
  if (l.protein_g + l.carbs_g + l.fat_g > 100) out.push("Protein, carbs and fat add up to more than 100 g per 100 g.");
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
      return setLookup({ error: e instanceof LookupError ? e.message : "The lookup failed. Fill the fields by hand." });
    }
    if (!got) return setLookup({ error: "This barcode is not on Open Food Facts. Fill the fields by hand." });
    const size = eggs ? got.eggs : got.packGrams;
    const hasLabelData = REQUIRED.every((k) => got.per_100g[k] != null);
    setForm((f) => ({ ...f, name: got.name || f.name, size: size != null ? str(size) : f.size,
      ...(hasLabelData ? Object.fromEntries(LABEL_FIELDS.map(([k]) => [k, str(got.per_100g[k])])) : {}) }));
    setFromOff(hasLabelData);
    setPackCheck(false);
    const note = size == null ? (eggs ? "It does not say how many eggs: add the eggs per box." : "It has no pack size: add it in grams.")
      : got.packFromMl ? `The pack is ${got.packGrams} ml: change it to grams if your food is heavier or lighter than water.`
      : null;
    setLookup({ found: true, url: `https://world.openfoodfacts.org/product/${form.barcode.trim()}`, note,
      text: `Found${got.name ? ` "${got.name}"` : ""}${got.quantity ? `, ${got.quantity}` : ""}.${hasLabelData ? "" : " No full label there: fill it from your pack."}` });
  };
  const label100 = Object.fromEntries(LABEL_FIELDS.map(([k]) => [k, num(form[k])]));
  const hasLabel = REQUIRED.some((k) => label100[k] != null);
  const warnings = hasLabel ? labelWarnings(label100) : [];

  const save = () => {
    const size = num(form.size);
    const price = num(form.price);
    if (!form.name.trim()) return showToast("Add the product name first.");
    if (!(size > 0)) return showToast(eggs ? "Add how many eggs come in one box." : "Add the pack size in grams.");
    if (packCheck === false) return showToast(eggs ? "Check the eggs per box against your pack, then tick the box." : "Check the pack size against your pack, then tick the box.");
    if (Number.isNaN(price)) return showToast("The price is not a number.");
    if (form.barcode.trim() && !/^\d{8,14}$/.test(form.barcode.trim())) return showToast("A barcode has 8 to 14 digits.");
    if (hasLabel && !REQUIRED.every((k) => label100[k] != null && !Number.isNaN(label100[k]))) {
      return showToast("Fill kcal, protein, carbs and fat from the label, or leave all four empty.");
    }
    const per100 = hasLabel ? Object.fromEntries(Object.entries(label100).filter(([, v]) => v != null && !Number.isNaN(v))) : null;
    const product = { food: row.foodKey, name: form.name, sold_by: form.sold_by,
      ...(eggs ? { units_per_pack: size } : { pack_grams: size }),
      ...(price != null ? { price_eur: price, price_date: price === p.price_eur && p.price_date ? p.price_date
        : new Date().toISOString().slice(0, 10) } : {}),
      ...(form.barcode.trim() ? { barcode: form.barcode.trim() } : {}), ...(per100 ? { per_100g: per100 } : {}),
      ...(per100 && fromOff ? { label_source: "open_food_facts" } : {}) };
    if (!okProduct(product)) return showToast("Some numbers are out of range. Check the pack size, price and label.");
    if (!saveProduct(store, product)) return showToast("Not saved: this browser blocks storage.");
    showToast(`Product saved for ${store === NO_STORE ? "every store" : storeLabel(store)}.`);
    onClose();
  };
  const remove = () => {
    if (!deleteProduct(store, row.foodKey)) return showToast("Not saved: this browser blocks storage.");
    showToast("Product removed. This food uses typical packs again.");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-forest/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="product-dialog-title" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-8 shadow-card border border-cream-dark max-w-lg w-full space-y-6 max-h-[90vh] overflow-y-auto">
        <div>
          <span className="font-script text-2xl text-forest font-bold">{store === NO_STORE ? "Any store" : storeLabel(store)}</span>
          <h2 id="product-dialog-title" className="font-serif text-3xl font-bold text-forest leading-snug">Your product for {row.ingredient}</h2>
          <p className="text-xs text-forest/70 mt-1">Saved in this browser. It replaces the typical pack{hasLabel ? " and the nutrition table" : ""} for this food in every meal.</p>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="product-name" className={label}>Product name</label>
            <input id="product-name" value={form.name} onChange={set("name")} maxLength={120} className={input} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {eggs ? (
              <div>
                <label htmlFor="product-size" className={label}>Eggs per box</label>
                <input id="product-size" inputMode="numeric" value={form.size} onChange={set("size")} className={input} />
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="product-sold-by" className={label}>Sold as</label>
                  <select id="product-sold-by" value={form.sold_by} onChange={set("sold_by")} className={input}>
                    <option value="pack">Pack</option>
                    <option value="per_kg">Loose, by weight</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="product-size" className={label}>{form.sold_by === "per_kg" ? "Unit you buy (g)" : "Pack size (g)"}</label>
                  <input id="product-size" inputMode="decimal" value={form.size} onChange={set("size")} className={input} />
                </div>
              </>
            )}
            <div>
              <label htmlFor="product-price" className={label}>Price ({moneySymbol()}){form.sold_by === "per_kg" ? " per unit" : " per pack"}</label>
              <input id="product-price" inputMode="decimal" value={form.price} onChange={set("price")} placeholder="optional" className={input} />
            </div>
            <div>
              <label htmlFor="product-barcode" className={label}>Barcode</label>
              <input id="product-barcode" inputMode="numeric" value={form.barcode} onChange={set("barcode")} placeholder="optional" maxLength={14} className={input} />
              <button type="button" onClick={findBarcode} disabled={!/^\d{8,14}$/.test(form.barcode.trim()) || lookup?.loading}
                className="text-[11px] font-bold text-forest/70 hover:text-lime-hover disabled:text-forest/30 mt-1">
                <i className="fa-solid fa-barcode mr-1"></i>{lookup?.loading ? "Looking up..." : "Look up on Open Food Facts"}
              </button>
            </div>
          </div>
          {lookup && !lookup.loading && (
            <div role="status" className={`text-xs rounded-xl p-3 space-y-1 ${lookup.error ? "bg-amber-100 text-amber-900" : "bg-cream text-forest"}`}>
              {lookup.error ? <span className="block">{lookup.error}</span> : (
                <>
                  <span className="block font-bold">{lookup.text}</span>
                  {lookup.note && <span className="block">{lookup.note}</span>}
                  <span className="block">Check the pack size and the label against your pack. Data from <a href={lookup.url} target="_blank" rel="noopener noreferrer" className="underline">Open Food Facts</a>, ODbL.</span>
                </>
              )}
            </div>
          )}
          {packCheck !== null && (
            <label className="flex items-center gap-2 text-xs font-bold text-forest">
              <input id="product-pack-check" type="checkbox" checked={packCheck} onChange={(e) => setPackCheck(e.target.checked)} className="accent-lime w-4 h-4" />
              {eggs ? "The eggs per box match my pack" : "The pack size matches my pack"}
            </label>
          )}
          <div>
            <span className={label}>Label, per 100 g</span>
            <div className="grid grid-cols-3 gap-3">
              {LABEL_FIELDS.map(([k, name]) => (
                <div key={k}>
                  <label htmlFor={`product-${k}`} className="block text-[11px] font-bold text-forest/60 mb-1">{name}</label>
                  <input id={`product-${k}`} inputMode="decimal" value={form[k]} onChange={set(k)} className={input} />
                </div>
              ))}
            </div>
            <span className={small}>{fromOff && hasLabel ? "From Open Food Facts. Edit any number to make it your own label."
              : "Optional. Fill kcal, protein, carbs and fat to use your label instead of the nutrition table; fiber and salt can stay empty."}</span>
            {warnings.length > 0 && (
              <div role="status" className="mt-3 bg-amber-100 text-amber-900 text-xs rounded-xl p-3 space-y-1">
                <span className="block font-bold">Check the label</span>
                {warnings.map((w) => <span key={w} className="block">{w}</span>)}
                <span className="block">You can still save it.</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={save} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-5 py-2.5 rounded-xl transition-colors">Save product</button>
          <button onClick={onClose} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2.5">Cancel</button>
          {own && (
            <button onClick={remove} className="text-xs font-bold text-forest/50 hover:text-red-600 px-3 py-2.5 ml-auto">Remove product</button>
          )}
        </div>
      </div>
    </div>
  );
}
