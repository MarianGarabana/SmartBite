// Where the site and its code live: link previews, sitemap and footer use these.
// NEXT_PUBLIC_SITE_URL overrides the demo address for a self-hosted copy.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://smartbite-steel.vercel.app";
export const REPO_URL = "https://github.com/MarianGarabana/SmartBite";

// Analytics: a meal made in a browser has its name in its address, so it is reported as /recipes/[own-meal]
export function hidePrivatePath(url, demoSlugs) {
  const u = new URL(url);
  const m = u.pathname.match(/^\/recipes\/([^/]+)\/?$/);
  if (m && !demoSlugs.includes(decodeURIComponent(m[1]))) u.pathname = "/recipes/[own-meal]";
  return u.toString();
}
