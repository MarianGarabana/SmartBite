import { loadDemoMeals } from "../../lib/demo";

// The demo meals as one static file (decided 2026-11-20): free-trial visitors see them as "Example recipes" in My
// Recipes and on Home. Fetched only by them, so the real app's pages stay as light as before.
export const dynamic = "force-static";

export function GET() {
  return Response.json(loadDemoMeals());
}
