import SharedRecipe from "../../components/SharedRecipe";
import { loadDemoMeals } from "../../lib/demo";

// A shared recipe link: the recipe is after "#", which never reaches the server (lib/share.js)
export const metadata = {
  title: "Shared recipe - SmartBite",
  description: "A recipe shared from SmartBite: grams, macros and a shopping list in whole packs.",
  robots: { index: false },
};

export default function Page() {
  return <SharedRecipe demoMeals={loadDemoMeals()} />;
}
