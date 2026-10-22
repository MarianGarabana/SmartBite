// The meal engine (Python, smartbite_engine behind /api/evaluate) turns a recipe into a Meal result: packs,
// macros and leftovers computed in code. Request {form, profile, picked_idea, recipe, products?, country?}; contract
// docs/contracts/evaluate.schema.json. products (the user's saved products: pack, price, label) is sent only when
// there is at least one, and country ("ES": estimated prices for the other lines) only when given, so a request
// without them is the same as before. The API key is never part of it.
export const EVALUATE_URL = "/api/evaluate";

export class EngineError extends Error {
  constructor(message) {
    super(message);
    this.name = "EngineError";
  }
}

const isMeal = (d) => d && typeof d === "object" && d.form && d.picked_idea && d.recipe && d.evaluation?.pack && d.evaluation?.macros;

export async function evaluateMeal({ form, profile, picked_idea, recipe, products, country, region }) {
  let res;
  try {
    res = await fetch(EVALUATE_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ form, profile, picked_idea, recipe, ...(products?.length ? { products } : {}),
        ...(country ? { country } : {}), ...(country && region ? { region } : {}) }),
    });
  } catch {
    throw new EngineError("Could not reach the meal engine that computes packs and macros.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const detail = typeof data?.detail === "string" ? ` ${data.detail}` : typeof data?.error === "string" ? ` ${data.error}`
      : typeof data?.errors?.[0] === "string" ? ` ${data.errors[0]}` : "";
    throw new EngineError(res.status === 404
      ? "The meal engine that computes packs and macros is not running on this site yet."
      : `The meal engine answered with an error (${res.status}).${detail}`);
  }
  const meal = isMeal(data) ? data : isMeal(data?.meal) ? data.meal : null;
  if (!meal) throw new EngineError("The meal engine sent a reply that is not a finished meal.");
  return meal;
}

// Replies by request (lib/cartmath.js mealRequest), so the Cart shows what the recipe page just got without asking
// again. A failed request is forgotten, so the next try asks the engine again. Small: the oldest reply goes first.
const CACHE_MAX = 64;
const cache = new Map();
export const requestKey = (request) => JSON.stringify(request);
export const cachedReply = (key) => cache.get(key)?.doc;

export function evaluateCached(request) {
  const key = requestKey(request);
  const hit = cache.get(key);
  if (hit) return hit.promise;
  const entry = { promise: evaluateMeal(request) };
  entry.promise.then((doc) => { entry.doc = doc; }, () => { if (cache.get(key) === entry) cache.delete(key); });
  cache.set(key, entry);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return entry.promise;
}
