import SmartBite from "../components/SmartBite";
import { loadDemoMeals } from "../lib/demo";
import { randomFive } from "../lib/meal";

export const dynamic = "force-dynamic"; // a new random five on every visit, and ?tab= from the other pages
const TAB_IDS = ["home", "recipes", "make-meal", "cart", "how-it-works"];

export default async function Page({ searchParams }) {
  const { tab } = await searchParams; // the recipe page links back with /?tab=<id>
  const meals = loadDemoMeals();
  return <SmartBite demoMeals={meals} homeMeals={randomFive(meals)} initialTab={TAB_IDS.includes(tab) ? tab : "home"} />;
}
