"use client";
// Meal tags (decided 2026-11-14): when a dish is eaten (one or more meal times) and its style. The same chips sit in
// Edit meal and in the box "Save in my recipes" opens, pre-ticked with the AI's tags (or the title guess for meals
// without them). Chip styles from the My Recipes filter chips (design freeze).
import { useEffect, useState } from "react";
import { MEAL_STYLES, MEAL_TIMES, STYLE_LABELS, TIME_LABELS } from "../lib/meal";

const label = "block text-xs font-bold uppercase tracking-wider text-forest/70 mb-1.5";
const chip = (on) => (on
  ? "bg-forest text-lime font-semibold px-4 py-2 rounded-full text-xs transition-all border border-forest"
  : "bg-white hover:bg-cream-dark text-forest font-medium px-4 py-2 rounded-full text-xs transition-all border border-cream-dark");

// value: { times: [...], style }; onChange gets the new value. At least one meal time stays ticked.
export function TagPicker({ value, onChange, idPrefix = "tags" }) {
  const toggle = (t) => {
    const on = value.times.includes(t);
    if (on && value.times.length === 1) return; // a meal is eaten at some time: keep one
    onChange({ ...value, times: on ? value.times.filter((x) => x !== t) : MEAL_TIMES.filter((x) => x === t || value.times.includes(x)) });
  };
  return (
    <div className="space-y-4">
      <div role="group" aria-labelledby={`${idPrefix}-times`}>
        <span id={`${idPrefix}-times`} className={label}>When do you eat it?</span>
        <div className="flex flex-wrap gap-2">
          {MEAL_TIMES.map((t) => (
            <button key={t} type="button" aria-pressed={value.times.includes(t)} onClick={() => toggle(t)} className={chip(value.times.includes(t))}>
              {TIME_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div role="radiogroup" aria-labelledby={`${idPrefix}-style`}>
        <span id={`${idPrefix}-style`} className={label}>Salad or warm meal?</span>
        <div className="flex flex-wrap gap-2">
          {MEAL_STYLES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={value.style === s} onClick={() => onChange({ ...value, style: s })} className={chip(value.style === s)}>
              {STYLE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// The box "Save in my recipes" opens: the tags to check, then Save. initial: { times, style, tagged }.
export function SaveTagsDialog({ name, initial, onSave, onClose }) {
  const [value, setValue] = useState({ times: initial.times, style: initial.style });
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-forest/40 flex items-center justify-center p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="save-tags-title" onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl p-6 sm:p-8 shadow-card border border-cream-dark max-w-lg w-full space-y-5 max-h-[90vh] overflow-y-auto">
        <div>
          <span className="font-script text-2xl text-forest font-bold">Save in my recipes</span>
          <h2 id="save-tags-title" className="font-serif text-3xl font-bold text-forest leading-snug">{name}</h2>
          <p className="text-xs text-forest/70 mt-1">
            {initial.tagged ? "The AI picked these. Change them if they are wrong." : "A guess from the name. Change it if it is wrong."}
            {" "}They decide where the meal shows in My Recipes, on Home and in My Day.
          </p>
        </div>
        <TagPicker value={value} onChange={setValue} idPrefix="save-tags" />
        <div className="flex items-center justify-end gap-4">
          <button type="button" onClick={onClose} className="text-xs font-bold text-forest/70 hover:text-forest">Cancel</button>
          <button type="button" onClick={() => onSave(value)}
            className="bg-lime hover:bg-lime-hover text-forest font-bold px-6 py-3 rounded-2xl text-sm transition-all shadow-glow flex items-center gap-2">
            <i className="fa-regular fa-bookmark"></i><span>Save</span>
          </button>
        </div>
      </div>
    </div>
  );
}
