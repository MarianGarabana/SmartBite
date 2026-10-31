import StartPage from "../../components/StartPage";
import { loadDemoMeals } from "../../lib/demo";

export const metadata = {
  title: "Start - SmartBite",
  description: "Make your own meals with your AI key, or try the demo with example meals.",
};

export default function Page() {
  return <StartPage demoMeals={loadDemoMeals()} />;
}
