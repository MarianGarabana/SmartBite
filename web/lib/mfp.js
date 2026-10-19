// MyFitnessPal block with the (raw)/(dry) marks: rice, pasta, quinoa and couscous in dry grams, meat, fish and
// vegetables raw. Word lists in English and Spanish. Used in the browser, so no server imports here.
const DRY_WORDS = new RegExp(
  "\\b(arroz|pasta|macarr|espagu|fideo|tallar|penne|fusil|lasa|avena|lenteja|quinoa|cusc|" +
  "rice|spaghetti|noodle|macaroni|oats|lentil|couscous)", "i");
const RAW_WORDS = new RegExp(
  "\\b(pollo|pechuga|contramuslo|muslo|pavo|ternera|cerdo|lomo|carne|salmon|merluza|bacalao|" +
  "gamba|sardina|caballa|atun|patata|boniato|tomate|pepino|calabacin|brocoli|espinaca|lechuga|" +
  "cebolla|cebolleta|pimiento|zanahoria|champinon|berenjena|judia|calabaza|coliflor|ajo|rucula|" +
  "guisante|verdura|kale|col|" +
  "chicken|turkey|beef|pork|salmon|cod|hake|prawn|shrimp|tuna|potato|sweet potato|tomato|cucumber|" +
  "zucchini|courgette|broccoli|spinach|lettuce|onion|pepper|carrot|mushroom|eggplant|aubergine|bean|" +
  "pumpkin|cauliflower|garlic|rocket|arugula)", "i");
const NOT_RAW_OR_DRY = new RegExp(
  "\\b(cocid|lata|conserva|bote|asad|frito|triturad|fiambre|caldo|polvo|microondas|" +
  "cooked|canned|tinned|jar|roasted|fried|crushed|stock|broth|powder)", "i");

export const normalize = (s) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// food = the generic food name of the ingredient
export function mfpMark(food, dry = false) {
  const name = normalize(food);
  if (NOT_RAW_OR_DRY.test(name)) return "";
  if (dry || DRY_WORDS.test(name)) return " (dry)";
  return RAW_WORDS.test(name) ? " (raw)" : "";
}

// Whole grams from 1 g up; a pinch under 1 g keeps one decimal (0.3 g of chili flakes for one serving, not 0 g)
export const mfpGrams = (g) => (g >= 1 ? Math.round(g) : Math.round(g * 10) / 10);

// A line that rounds to 0 g is left out
export function mfpBlock(title, servings, items) {
  const lines = [`SmartBite: ${title}`, `Servings: ${servings}`, ""];
  for (const i of items) {
    const g = mfpGrams(i.grams);
    if (g > 0) lines.push(`${i.name}, ${g} g${mfpMark(i.food, i.dry)}`);
  }
  return lines.join("\n");
}
