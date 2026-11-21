// Numbers and money by country (lib/numbers.js, decided 2026-11-21): Spain "5,50 €", Mexico and the USA "$5.50"
import assert from "node:assert/strict";
import test from "node:test";
import { decimalsIn, formatDecimal, formatFixed, formatMoney, moneySymbolFor, numberFormat, setNumberFormat } from "../lib/numbers.js";

const nbsp = (s) => s.replace(/ | /g, " "); // Intl puts a no-break space before the euro sign

test("money: the country picks the format, the currency the symbol", () => {
  assert.equal(nbsp(formatMoney(5.5, { country: "ES", currency: "EUR" })), "5,50 €");
  assert.equal(formatMoney(5.5, { country: "MX", currency: "MXN" }), "$5.50");
  assert.equal(formatMoney(5.5, { country: "US", currency: "USD" }), "$5.50");
  assert.equal(formatMoney(5.5, { country: "GB", currency: "GBP" }), "£5.50");
  assert.equal(nbsp(formatMoney(5.5, { country: "FR", currency: "EUR" })), "5,50 €");
  assert.equal(formatMoney(5.5, { country: "IE", currency: "EUR" }), "€5.50");
  assert.equal(formatMoney(1234.5, { country: "US", currency: "USD" }), "$1,234.50");
  // No format for the country ("Other country"): the old style, symbol first
  assert.equal(formatMoney(5.5, { country: "other", currency: "EUR" }), "€5.50");
  assert.equal(formatMoney(5.5, { country: "other", currency: "CHF" }), "CHF 5.50");
});

test("money: the page's country and currency are the default; Spain and the euro before storage is read", () => {
  const before = numberFormat();
  try {
    setNumberFormat(null, null);
    assert.equal(nbsp(formatMoney(4.99)), "4,99 €");
    setNumberFormat("MX", "MXN");
    assert.equal(formatMoney(4.99), "$4.99");
    assert.equal(formatFixed(5.5), "5.50");
    assert.equal(formatDecimal(2.14), "2.1");
  } finally {
    setNumberFormat(before.country, before.currency);
  }
});

test("decimals: boxes get fixed decimals with no grouping; text gets the country's decimal mark", () => {
  assert.equal(formatFixed(5.5, 2, { country: "ES" }), "5,50");
  assert.equal(formatFixed(1234.5, 2, { country: "ES" }), "1234,50");
  assert.equal(formatFixed(1234.5, 2, { country: "US" }), "1234.50");
  assert.equal(formatDecimal(5.94, 1, { country: "ES" }), "5,9");
  assert.equal(formatDecimal(5, 1, { country: "ES" }), "5");
  assert.equal(formatDecimal(4.99, 2, { country: "MX" }), "4.99");
  assert.equal(decimalsIn("2.1 mg", { country: "ES" }), "2,1 mg");
  assert.equal(decimalsIn("<0.1 µg", { country: "ES" }), "<0,1 µg");
  assert.equal(decimalsIn("812 mg", { country: "ES" }), "812 mg");
  assert.equal(decimalsIn("2.1 mg", { country: "MX" }), "2.1 mg");
});

test("money symbol as the country writes it", () => {
  assert.equal(moneySymbolFor({ country: "ES", currency: "EUR" }), "€");
  assert.equal(moneySymbolFor({ country: "MX", currency: "MXN" }), "$");
  assert.equal(moneySymbolFor({ country: "AU", currency: "AUD" }), "$");
  assert.equal(moneySymbolFor({ country: "ES", currency: "USD" }), "US$");
  assert.equal(moneySymbolFor({ country: "other", currency: "CHF" }), "CHF");
});
