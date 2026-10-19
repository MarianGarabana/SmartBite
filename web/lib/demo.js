// Server only: the demo meals that ship with the site, from demo/meals/*.json (Meal result shape).
import fs from "node:fs";
import path from "node:path";
import { SLUG, toMeal } from "./meal";

const DEMO_DIR = path.join(process.cwd(), "demo", "meals");

export function loadDemoMeals() {
  if (!fs.existsSync(DEMO_DIR)) return [];
  return fs
    .readdirSync(DEMO_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => f.replace(/\.json$/, ""))
    .filter((slug) => SLUG.test(slug))
    .map((slug) => toMeal(slug, JSON.parse(fs.readFileSync(path.join(DEMO_DIR, `${slug}.json`), "utf8")), { kind: "demo" }));
}
