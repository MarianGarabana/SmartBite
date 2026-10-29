"use client"; // Error boundaries must be Client Components
// Kept apart from the page shell: if the shell is what failed, this still renders.
import { useEffect } from "react";

export default function Error({ error, retry }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-cream">
      <div className="bg-white rounded-3xl p-10 shadow-soft border border-cream-dark max-w-md text-center space-y-3">
        <span className="font-script text-3xl text-forest font-bold">Something burnt</span>
        <h1 className="font-serif text-3xl font-bold text-forest">This page hit an error</h1>
        <p className="text-sm text-forest/70">Your profile, cart and meals are safe in this browser. Try again, or go back home.</p>
        {error?.digest ? <p className="text-xs text-forest/70">Error id: {error.digest}</p> : null}
        <div className="pt-3 flex items-center justify-center gap-3">
          <button onClick={() => retry()} className="bg-lime hover:bg-lime-hover text-forest font-bold text-sm px-6 py-3 rounded-full transition-colors">
            Try again
          </button>
          <a href="/" className="text-sm font-bold text-forest underline hover:text-lime-hover">Home</a>
        </div>
      </div>
    </main>
  );
}
