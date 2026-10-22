"use client";
// Short privacy note: no accounts, data stays in the browser.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell, useToast } from "./Chrome";

const POINTS = [
  ["fa-user-slash", "No accounts", "There is no sign-up and no login. SmartBite does not know who you are."],
  ["fa-laptop", "Your data stays in your browser",
    "Your Kitchen Profile, cart, saved meals and photos are kept in this browser's storage (localStorage and IndexedDB). They are not sent to a SmartBite server. Clearing your browser data deletes them."],
  ["fa-key", "Your API key",
    "Your API key is stored only in this browser. It never leaves the browser except to the provider you chose in Settings (api.anthropic.com for Anthropic), when you make a meal."],
  ["fa-wand-magic-sparkles", "What goes to the AI provider",
    "When you make a meal, your craving, form and Kitchen Profile are sent from your browser to the provider you chose (Anthropic by default) to write the ideas and the recipe. That provider's own terms apply to that request."],
  ["fa-gears", "What goes to the SmartBite engine",
    "The form, your Kitchen Profile, the picked idea and the recipe go to the SmartBite engine to compute packs, macros and leftovers. It sends the result back and keeps nothing. Your key is never sent there."],
  ["fa-barcode", "Barcode lookups",
    "When you press Look up in Edit product, your browser asks Open Food Facts for that one barcode. Only the barcode is sent, with your IP address and browser details like any web request. Nothing about you, your profile or your meals goes there. Open Food Facts data is under the ODbL licence."],
  ["fa-calculator", "Math in code",
    "Ideas and recipes are AI-generated. Packs, macros and leftovers are computed in code, not by the model."],
];

export default function PrivacyPage({ demoMeals }) {
  const router = useRouter();
  const toastState = useToast();
  return (
    <PageShell active="privacy" demoMeals={demoMeals} router={router} toastState={toastState}>
      <section id="privacy-page" className="tab-page space-y-10 max-w-[1360px] mx-auto px-8">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <span className="font-script text-3xl text-forest font-bold">Short and plain</span>
          <h1 className="font-serif text-4xl font-bold text-forest">Privacy Note</h1>
          <p className="text-xs text-forest/70">No accounts, and your data stays in your browser.</p>
        </div>
        <div className="max-w-3xl mx-auto space-y-4">
          {POINTS.map(([icon, title, text]) => (
            <div key={title} className="bg-white rounded-3xl p-6 shadow-soft border border-cream-dark flex items-start gap-4">
              <div className="w-10 h-10 rounded-2xl bg-forest text-lime flex items-center justify-center shrink-0">
                <i className={`fa-solid ${icon}`}></i>
              </div>
              <div className="space-y-1">
                <h3 className="font-serif font-bold text-base text-forest">{title}</h3>
                <p className="text-xs text-forest/70 leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
          <p className="text-xs text-forest/60 text-center pt-2">
            Change your profile or remove your key in <Link href="/settings" className="font-bold underline hover:text-lime-hover">Settings</Link>.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
