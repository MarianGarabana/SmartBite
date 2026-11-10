// Make Your Meal form check, same rules as smartbite_engine/form.py (MealForm). Pure.
const GEAR = new Set(["microwave_only", "oven", "air_fryer", "no_blender"]);
const num = (v) => (v === null || v === "" || v === undefined ? null : Number(v));

export function checkForm(f) {
  const form = {
    craving: String(f.craving || "").trim(),
    exclude: Array.isArray(f.exclude) ? f.exclude.map((x) => String(x).trim()).filter(Boolean) : [],
    kcal_target: num(f.kcal_target), protein_g_target: num(f.protein_g_target),
    carbs_g_max: num(f.carbs_g_max), fat_g_max: num(f.fat_g_max),
    budget_total_eur: num(f.budget_total_eur), servings: num(f.servings),
    time_limit_min: num(f.time_limit_min),
    gear: Array.isArray(f.gear) ? f.gear : [],
    reheat_at_work: Boolean(f.reheat_at_work), keep_leftovers_low: Boolean(f.keep_leftovers_low),
  };
  const errors = [];
  if (!form.craving) errors.push("craving is required");
  if (form.craving.length > 300) errors.push("craving is longer than 300 characters");
  if (!Number.isInteger(form.servings) || form.servings < 1 || form.servings > 8) errors.push("servings must be 1 to 8");
  if (!(form.budget_total_eur > 0)) errors.push("budget must be above 0");
  for (const k of ["kcal_target", "protein_g_target", "carbs_g_max", "fat_g_max", "time_limit_min"])
    if (form[k] !== null && !(form[k] > 0)) errors.push(`${k} must be above 0`);
  if (form.gear.some((g) => !GEAR.has(g))) errors.push("unknown gear");
  return { form, errors };
}
