import SmartBite from "../components/SmartBite";
import { TAB_IDS } from "../lib/site";

export const dynamic = "force-dynamic"; // ?tab= from the other pages
// The real app: only the meals made in this browser, so no demo meals here (they live at /demo)

export default async function Page({ searchParams }) {
  const { tab } = await searchParams; // the recipe page links back with /?tab=<id>
  return <SmartBite initialTab={TAB_IDS.includes(tab) ? tab : "home"} />;
}
