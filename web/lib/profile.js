// Kitchen Profile, in the shape of docs/contracts/kitchen-profile.schema.json (sections of editable fields).
// The defaults are prompts/kitchen-profile.default.json (copied to generated/ before build). The Make Your Meal form
// reads kcal_target and protein_g_target for its defaults.
import { DEFAULT_PROFILE as DEFAULTS } from "../generated/index.js";

export const DEFAULT_PROFILE = DEFAULTS;

export function fieldValue(profile, id, fallback = null) {
  for (const s of profile?.sections || []) {
    const f = s.fields.find((x) => x.id === id);
    if (f) return f.value ?? fallback;
  }
  return fallback;
}

export function setField(profile, id, value) {
  return { ...profile, sections: profile.sections.map((s) => ({ ...s,
    fields: s.fields.map((f) => (f.id === id ? { ...f, value } : f)) })) };
}

// A stored profile on the current default fields: values kept by field id when the type still matches, fields
// that no longer exist dropped, new fields at their default. So a saved profile survives changes to the defaults.
export function mergeProfile(stored) {
  const saved = {};
  for (const s of stored?.sections || []) for (const f of s.fields || []) if (f && f.id) saved[f.id] = f;
  return { ...DEFAULT_PROFILE, sections: DEFAULT_PROFILE.sections.map((s) => ({ ...s,
    fields: s.fields.map((f) => {
      const old = saved[f.id];
      return old && old.type === f.type && "value" in old ? { ...f, value: old.value } : f;
    }) })) };
}
