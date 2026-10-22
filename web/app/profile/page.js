import ProfilePage from "../../components/ProfilePage";
import { loadDemoMeals } from "../../lib/demo";

export const metadata = { title: "Profile - SmartBite" };

export default function Page() {
  return <ProfilePage demoMeals={loadDemoMeals()} />;
}
