import { loadDemoMeals } from "../lib/demo";
import { SITE_URL } from "../lib/site";

// Home, start, the demo, privacy and the demo recipes; meals made in a browser have no public page
export default function sitemap() {
  const pages = ["", "/start", "/demo", "/privacy"].map((p) => ({ url: `${SITE_URL}${p}` }));
  const recipes = loadDemoMeals().map((m) => ({ url: `${SITE_URL}/recipes/${m.slug}` }));
  return [...pages, ...recipes];
}
