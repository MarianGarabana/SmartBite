// Pack math shared by the recipe page and the cart (both in the browser): same rule as the mockup,
// whole packs that cover the grams needed. A line: { needed, packSize, packPrice, hasPrice, storage }.
// packSize comes from typical pack sizes; packPrice is null until the user sets a price, so the pack math runs
// without prices and only the costs wait for one.
export function packRow(line, needed) {
  if (!line.packSize) return { ...line, needed };
  // Optional lines (spices, oil, sauces, bottled juice): at least one pack, even "to taste"
  const packs = Math.max(line.optional ? 1 : 0, Math.ceil(needed / line.packSize - 1e-9));
  const bought = packs * line.packSize;
  const left = bought - needed;
  const cost = (g) => (line.hasPrice ? (g / line.packSize) * line.packPrice : null);
  return { ...line, needed, packs, bought, left, price: line.hasPrice ? packs * line.packPrice : null,
    usedCost: cost(needed), leftCost: cost(left),
    status: left <= 0 ? null : line.storage === "keeps" || line.storage === "frozen" ? "Keeps" : "Use in 2 days" };
}

// Optional rows count only when ticked in the cart (included), and their leftover is never waste.
// Waste grams count every row with a pack size; costs count only rows with a price.
export function totals(rows) {
  const t = { bought: 0, used: 0, wasteGrams: 0, wasteCost: 0, unpriced: 0, priced: 0, optional: 0 };
  for (const r of rows) {
    if (r.have) continue; // already at home: not bought, not waste
    if (r.optional) {
      if (r.hasPrice && r.included) { t.bought += r.price; t.used += r.usedCost; t.optional += r.price; }
      continue;
    }
    if (r.packSize) t.wasteGrams += r.left;
    if (!r.hasPrice) { t.unpriced += 1; continue; }
    t.priced += 1;
    t.bought += r.price; t.used += r.usedCost; t.wasteCost += r.leftCost;
  }
  return t;
}
