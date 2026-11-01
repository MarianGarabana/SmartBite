"use client";
// Open a profile file (decided 2026-11-01): one drop zone for /start and the Profile page. Drag the .json in, or tap
// to choose it (phones cannot drag files). A browser with no profile of its own opens the file at once; one that has
// a profile asks first and downloads its current profile as a backup. Drop zone styles from the recipe photo drop
// zone, confirm from the Profile page's (design freeze).
import { useState } from "react";
import { MAX_PROFILE_FILE, exportProfile, hasProfile, openProfile, readProfileFile } from "../lib/store";
import { downloadJson } from "./Chrome";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// onOpened(summary, ok) runs after the file replaced this browser's profile; showToast shows the errors
export default function ProfileFileOpen({ id, onOpened, showToast }) {
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(null); // { fileName, data, summary, backup } waiting for the confirm

  const open = (p) => {
    if (p.backup) downloadJson(exportProfile(), "smartbite-profile-backup");
    const ok = openProfile(p.data);
    setPending(null);
    onOpened(p.summary, ok, p.backup);
  };
  const read = async (file) => {
    if (!file) return;
    if (file.size > MAX_PROFILE_FILE) return showToast("This file is too big for a profile file.");
    const out = readProfileFile(await file.text());
    if (!out.ok) return showToast(out.error);
    const p = { fileName: file.name, ...out, backup: hasProfile() };
    if (p.backup) setPending(p);
    else open(p);
  };

  return (
    <div className="space-y-3">
      <label id={`${id}-drop`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); read(e.dataTransfer.files[0]); }}
        className={`flex flex-col items-center justify-center gap-2 h-32 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${dragging ? "border-lime bg-lime-soft" : "border-cream-dark bg-cream/50 hover:bg-cream-card"}`}>
        <i className="fa-solid fa-file-import text-2xl text-forest/50"></i>
        {/* Phones and tablets cannot drag a file: they read "Tap to choose" */}
        <span className="text-xs font-bold text-forest [@media(pointer:coarse)]:hidden">Drop your profile file here, or click to choose it</span>
        <span className="text-xs font-bold text-forest hidden [@media(pointer:coarse)]:inline">Tap to choose your profile file</span>
        <span className="text-[11px] text-forest/70">Named smartbite-profile-(date).json</span>
        <input id={`${id}-open`} type="file" accept="application/json,.json" className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; read(f); }} />
      </label>
      {pending && (
        <div role="alertdialog" aria-labelledby={`${id}-confirm`} className="bg-cream rounded-xl p-4 space-y-3 border border-cream-dark">
          <p id={`${id}-confirm`} className="text-xs text-forest leading-relaxed">
            <span className="font-bold">Replace this browser&apos;s profile with {pending.summary.name ? `${pending.summary.name}'s profile` : "the profile"} ({pending.fileName})?</span>{" "}
            It has {plural(pending.summary.meals, "saved meal")} and {plural(pending.summary.products, "product")}{pending.summary.keys ? ", and an API key" : ""}.
            Your current profile downloads first as a backup{pending.summary.keys ? "" : "; your API key stays as it is"}.
          </p>
          <div className="flex gap-3">
            <button onClick={() => open(pending)} className="bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-4 py-2 rounded-xl transition-colors">Replace</button>
            <button onClick={() => setPending(null)} className="text-xs font-bold text-forest/70 hover:text-forest px-3 py-2">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
