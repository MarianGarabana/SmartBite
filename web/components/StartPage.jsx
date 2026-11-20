"use client";
// The way in (decided 2026-10-31): no accounts. "Use my API key" opens the setup (shop, key) and then Make Your Meal;
// "Try the demo" opens /demo; "I have a profile file" (decided 2026-11-01) opens a saved profile, asks for the key if
// the file has none, then Make Your Meal. The real Make Your Meal sends people here until the profile is complete.
// Cards and buttons reuse the Make Your Meal and setup card styles (design freeze).
// Free trial (decided 2026-11-20): when /api/trial says it is on, a card above the others makes up to 3 meals with
// SmartBite's own key (lib/providers.js TRIAL), no key needed.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TRIAL_MEALS } from "../lib/providers";
import { TRIAL_URL } from "../lib/llm";
import { llmReady, profileComplete, readOwnLlm, readTrial, startTrial, trialMealsLeft } from "../lib/store";
import { PageShell, useProfileComplete, useToast } from "./Chrome";
import ProfileFileOpen from "./ProfileFileOpen";
import { openSetup } from "./SetupDialog";

const card = "bg-white rounded-3xl p-8 shadow-soft border border-cream-dark flex flex-col gap-4";
const icon = "w-12 h-12 rounded-2xl bg-lime-soft text-forest flex items-center justify-center text-lg";

export default function StartPage({ demoMeals }) {
  const router = useRouter();
  const toastState = useToast();
  const complete = useProfileComplete();
  const afterSetup = (state, opts) => {
    if (state !== "done" || opts?.profile) return;
    if (profileComplete()) router.push("/?tab=make-meal");
    else toastState.showToast("Add your AI key to make your own meals.");
  };
  const setUp = () => openSetup(afterSetup);
  // Free trial: offered when the server has the trial key and this browser has no key of its own
  const [trial, setTrial] = useState(null); // null | { left }
  useEffect(() => {
    if (llmReady(readOwnLlm())) return;
    let live = true;
    fetch(TRIAL_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((s) => live && s?.available && setTrial({ left: trialMealsLeft(readTrial()) }));
    return () => { live = false; };
  }, []);
  const tryFree = () => {
    if (!startTrial()) return toastState.showToast("Not started: this browser blocks storage.");
    router.push("/?tab=make-meal");
  };
  // A profile file with a key (or a provider that needs none) goes straight to Make Your Meal; else the key step
  const fileOpened = (_summary, ok, backup) => {
    if (!ok) return toastState.showToast("Not saved: this browser blocks storage.");
    if (backup) toastState.showToast("Profile opened. Your previous one was downloaded as a backup.");
    if (profileComplete()) router.push("/?tab=make-meal");
    else openSetup(afterSetup, { keyOnly: true });
  };
  return (
    <PageShell active={null} demoMeals={demoMeals} router={router} toastState={toastState}>
      <section id="start-page" className="tab-page space-y-10 max-w-[1360px] mx-auto px-8">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <span className="font-script text-3xl text-forest font-bold">{trial ? "Four ways in" : "Three ways in"}</span>
          <h1 className="font-serif text-4xl font-bold text-forest">Start SmartBite</h1>
          <p className="text-sm text-forest/70">
            {trial?.left > 0 ? `No sign-up. Try ${TRIAL_MEALS} free meals, make` : "No sign-up. Make"} your own meals with your AI key, look
            around with example meals first, or open the profile file you saved.
          </p>
        </div>
        {trial && (
          <div id="start-trial" className="bg-forest rounded-3xl p-8 shadow-soft max-w-6xl mx-auto flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-12 h-12 rounded-2xl bg-lime text-forest flex items-center justify-center text-lg shrink-0">
              <i className="fa-solid fa-wand-magic-sparkles"></i>
            </div>
            <div className="flex-1 space-y-2">
              <h2 className="font-serif text-2xl font-bold text-cream">Try {TRIAL_MEALS} free meals</h2>
              <p className="text-xs text-cream/80">
                {trial.left > 0
                  ? <>No key needed. SmartBite makes your first {TRIAL_MEALS} meals with its own AI key (Claude Haiku). Your
                    answers go through SmartBite&apos;s server to Anthropic and are not stored. {trial.left < TRIAL_MEALS && <span className="font-bold text-cream">{trial.left} left.</span>}</>
                  : <>You have made your {TRIAL_MEALS} free meals. Add your own AI key to keep going.</>}
              </p>
            </div>
            {trial.left > 0 && (
              <button id="start-trial-go" onClick={tryFree} className="self-start md:self-center bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-6 py-3 rounded-full transition-all whitespace-nowrap">
                Make a free meal
              </button>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <div id="start-key" className={card}>
            <div className={icon}><i className="fa-solid fa-key"></i></div>
            <h2 className="font-serif text-2xl font-bold text-forest">Use my API key</h2>
            <p className="text-xs text-forest/70 flex-1">
              Pick where you shop and add your AI key (Anthropic Claude or Google Gemini). Two short steps. Your
              key and your profile stay in this browser.
            </p>
            {complete && (
              <p id="start-ready" className="text-xs text-forest/80">
                <span className="font-bold text-forest">Your key is saved.</span>{" "}
                <Link href="/?tab=make-meal" className="font-bold underline hover:text-lime-hover">Go to Make Your Meal</Link>
              </p>
            )}
            <button onClick={setUp} className="self-start bg-lime hover:bg-lime-hover text-forest font-bold text-xs px-6 py-3 rounded-full transition-all whitespace-nowrap">
              Use my API key
            </button>
          </div>
          <div id="start-demo" className={card}>
            <div className={icon}><i className="fa-solid fa-utensils"></i></div>
            <h2 className="font-serif text-2xl font-bold text-forest">Try the demo</h2>
            <p className="text-xs text-forest/70 flex-1">
              Example meals made ahead, with their recipes, whole-pack shopping lists and macros. No key needed.
            </p>
            <Link href="/demo" className="self-start bg-forest hover:bg-forest-light text-lime font-bold text-xs px-6 py-3 rounded-full transition-all whitespace-nowrap">
              Try the demo
            </Link>
          </div>
          <div id="start-file" className={`${card} md:col-span-2 lg:col-span-1`}>
            <div className={icon}><i className="fa-solid fa-file-import"></i></div>
            <h2 className="font-serif text-2xl font-bold text-forest">I have a profile file</h2>
            <p className="text-xs text-forest/70 flex-1">
              Used SmartBite in another browser? Open the profile file you saved there to bring back where you shop, your
              Kitchen Profile, products, saved meals and cart.
            </p>
            <ProfileFileOpen id="start-file" onOpened={fileOpened} showToast={toastState.showToast} />
          </div>
        </div>
      </section>
    </PageShell>
  );
}
