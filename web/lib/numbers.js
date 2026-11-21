// Numbers and money in the format of the user's country (decided 2026-11-21): Spain "5,50 €", Mexico and the USA
// "$5.50", France "5,50 €", the UK "£5.50". The Profile country picks the format, the currency picks the symbol (nothing
// is converted). A country with no format here ("Other country") keeps the site's old style: "€5.50", "CHF 5.50".
// Pure (no React, no storage): components/Chrome.jsx useCurrency sets the country and currency once storage is read;
// the server render and the first paint use the defaults (Spain, euro), like the money symbol did before.
export const NUMBER_LOCALES = { AU: "en-AU", CA: "en-CA", ES: "es-ES", FR: "fr-FR", GB: "en-GB", IE: "en-IE", MX: "es-MX", US: "en-US" };

let current = { country: "ES", currency: "EUR" };
const cache = new Map();
function formatter(locale, options) {
  const key = `${locale}|${JSON.stringify(options)}`;
  if (!cache.has(key)) {
    try {
      cache.set(key, new Intl.NumberFormat(locale, options));
    } catch {
      cache.set(key, null);
    }
  }
  return cache.get(key);
}

export function setNumberFormat(country, currency) {
  current = { country: country || "ES", currency: currency || "EUR" };
}
export const numberFormat = () => current;

const symbolOf = (currency) => formatter("en", { style: "currency", currency })?.formatToParts(1)
  .find((p) => p.type === "currency")?.value || currency;

// A price: "5,50 €" in Spain, "$5.50" in Mexico and the USA; the old "€5.50" for a country with no format here
export function formatMoney(v, { country = current.country, currency = current.currency } = {}) {
  const locale = NUMBER_LOCALES[country];
  const f = locale && formatter(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (f) return f.format(v);
  const symbol = symbolOf(currency);
  return `${symbol}${symbol.length > 1 ? " " : ""}${v.toFixed(2)}`;
}

// The money symbol as the country writes it: "€", "$" for the Mexican peso or the Australian dollar in its own country
export function moneySymbolFor({ country = current.country, currency = current.currency } = {}) {
  const locale = NUMBER_LOCALES[country];
  const f = locale && formatter(locale, { style: "currency", currency });
  return f?.formatToParts(1).find((p) => p.type === "currency")?.value || symbolOf(currency);
}

// A number with exactly this many decimals and no thousands separator, for a box the user types into: "5,50" in
// Spain, "5.50" in Mexico (the boxes read both a comma and a point)
export function formatFixed(v, digits = 2, { country = current.country } = {}) {
  const f = formatter(NUMBER_LOCALES[country] || "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
  return f ? f.format(v) : v.toFixed(digits);
}

// A number shown as text with at most this many decimals: 2.1 -> "2,1" in Spain, "2.1" in Mexico; 1234 -> "1234"
export function formatDecimal(v, digits = 1, { country = current.country } = {}) {
  const f = formatter(NUMBER_LOCALES[country] || "en-US", { maximumFractionDigits: digits, useGrouping: false });
  return f ? f.format(v) : String(Math.round(v * 10 ** digits) / 10 ** digits);
}

// A text that already has its numbers ("2.1 mg", "<0.1 µg", made by lib/meal.js amountText, which also runs on the
// server) with the decimal mark of the country: "2,1 mg" in Spain
export function decimalsIn(text, { country = current.country } = {}) {
  const mark = formatter(NUMBER_LOCALES[country] || "en-US", { minimumFractionDigits: 1 })?.formatToParts(1.5)
    .find((p) => p.type === "decimal")?.value || ".";
  return mark === "." ? text : String(text).replace(/(\d)\.(\d)/g, `$1${mark}$2`);
}
