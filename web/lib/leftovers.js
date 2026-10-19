// Leftovers: what the cart meals leave over, worked out live from the merged cart rows (no stored list, nothing
// expires). Deleting a meal from the cart removes its leftovers. Suggestions are My Recipes meals not in the cart
// that use the same products, so adding one uses packs that are already bought. A recipe matches by food, whatever
// pack size its saved meal shows: the pack size depends on the servings the engine ran it for.
const foodOf = (key) => key.slice(0, key.lastIndexOf("|"));

export function leftoverView(rows, meals, cartSlugs, max = 4) {
  const leftovers = rows
    .filter((r) => r.packSize && r.left > 0)
    .map((r) => ({ ingredient: r.ingredient, key: r.key, left: r.left, leftCost: r.leftCost, status: r.status }));
  const byFood = Object.fromEntries(leftovers.map((l) => [foodOf(l.key), l]));
  const inCart = new Set(cartSlugs);
  const leftoverRecipes = meals
    .filter((m) => (m.kind === "demo" || m.saved) && !inCart.has(m.slug))
    .map((m) => {
      const uses = [...new Set(m.lines.map((l) => foodOf(l.key)).filter((f) => byFood[f]))].map((f) => byFood[f]);
      return { slug: m.slug, name: m.name, uses: uses.map((l) => l.ingredient),
        value: uses.reduce((s, l) => s + (l.leftCost ?? 0), 0) };
    })
    .filter((r) => r.uses.length)
    .sort((a, b) => b.uses.length - a.uses.length || b.value - a.value)
    .slice(0, max);
  return { leftovers, leftoverRecipes };
}
