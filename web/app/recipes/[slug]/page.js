import RecipePage from "../../../components/RecipePage";
import { loadDemoMeals } from "../../../lib/demo";

// Demo meals are built ahead; any other slug is a meal made in a browser, looked up there
export function generateStaticParams() {
  return loadDemoMeals().map((m) => ({ slug: m.slug }));
}

// Demo meals get their own title, macros and photo in link previews; browser-made meals keep the site's
export async function generateMetadata({ params }) {
  const { slug } = await params;
  const meal = loadDemoMeals().find((m) => m.slug === slug);
  if (!meal) return {};
  const title = `${meal.name} - SmartBite`;
  const description = `${meal.kcal} kcal and ${meal.protein} g protein per serving. Recipe in grams, shopping list in whole packs.`;
  const images = meal.images.length ? [{ url: meal.images[0], alt: `${meal.name} (AI-generated photo)` }] : undefined;
  return {
    title,
    description,
    openGraph: { type: "article", siteName: "SmartBite", title, description, url: `/recipes/${slug}`, images },
    twitter: { card: "summary_large_image", title, description, images },
  };
}

export default async function Page({ params }) {
  const { slug } = await params;
  return <RecipePage slug={slug} demoMeals={loadDemoMeals()} />;
}
