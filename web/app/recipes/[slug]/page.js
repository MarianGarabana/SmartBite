import RecipePage from "../../../components/RecipePage";
import { loadDemoMeals } from "../../../lib/demo";

// Demo meals are built ahead; any other slug is a meal made in a browser, looked up there
export function generateStaticParams() {
  return loadDemoMeals().map((m) => ({ slug: m.slug }));
}

export default async function Page({ params }) {
  const { slug } = await params;
  return <RecipePage slug={slug} demoMeals={loadDemoMeals()} />;
}
