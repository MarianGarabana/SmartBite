"use client";
// 404: same header and footer as the other pages, and a way back.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell, useToast } from "./Chrome";

export default function NotFoundPage({ demoMeals }) {
  const router = useRouter();
  const toastState = useToast();
  return (
    <PageShell active={null} demoMeals={demoMeals} router={router} toastState={toastState}>
      <section id="not-found-page" className="tab-page max-w-[1360px] mx-auto px-8">
        <div className="text-center max-w-xl mx-auto space-y-3 py-12">
          <span className="font-script text-3xl text-forest font-bold">Nothing on this plate</span>
          <h1 className="font-serif text-4xl font-bold text-forest">Page not found</h1>
          <p className="text-sm text-forest/70">This page does not exist. A meal made in another browser only opens in that browser.</p>
          <div className="pt-4">
            <Link href="/" className="inline-flex items-center gap-3 bg-lime hover:bg-lime-hover text-forest font-bold text-sm px-6 py-3 rounded-full transition-colors">
              <span>Back to SmartBite</span>
              <i className="fa-solid fa-arrow-right text-xs"></i>
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
