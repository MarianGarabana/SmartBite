import SettingsPage from "../../components/SettingsPage";
import { loadDemoMeals } from "../../lib/demo";

export const metadata = { title: "Settings - SmartBite" };

export default function Page() {
  return <SettingsPage demoMeals={loadDemoMeals()} />;
}
