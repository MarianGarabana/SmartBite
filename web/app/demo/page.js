import { DemoMode } from "../../components/Chrome";
import SmartBite from "../../components/SmartBite";
import { loadDemoMeals } from "../../lib/demo";
import { randomFive } from "../../lib/meal";
import { TAB_IDS } from "../../lib/site";

export const dynamic = "force-dynamic"; // a new random five on every visit, and ?tab= from the demo recipe pages
export const metadata = {
  title: "Demo - SmartBite",
  description: "Try SmartBite with example meals made ahead: no AI key needed.",
};

// The demo (decided 2026-10-30): the same app with the demo meals and its own cart, no key, no model call
export default async function Page({ searchParams }) {
  const { tab } = await searchParams;
  const meals = loadDemoMeals();
  return (
    <DemoMode>
      <SmartBite demoMeals={meals} homeMeals={randomFive(meals)} initialTab={TAB_IDS.includes(tab) ? tab : "home"} />
    </DemoMode>
  );
}
