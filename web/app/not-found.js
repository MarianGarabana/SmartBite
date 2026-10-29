import NotFoundPage from "../components/NotFoundPage";
import { loadDemoMeals } from "../lib/demo";

export const metadata = { title: "Page not found - SmartBite" };

export default function NotFound() {
  return <NotFoundPage demoMeals={loadDemoMeals()} />;
}
