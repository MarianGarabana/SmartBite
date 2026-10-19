import PrivacyPage from "../../components/PrivacyPage";
import { loadDemoMeals } from "../../lib/demo";

export const metadata = { title: "Privacy - SmartBite" };

export default function Page() {
  return <PrivacyPage demoMeals={loadDemoMeals()} />;
}
