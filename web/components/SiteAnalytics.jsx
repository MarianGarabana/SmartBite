"use client";
// Vercel Web Analytics: no cookies, page views only. A meal made in a browser has its name in the address
// (/recipes/<slug>), so those paths are sent as /recipes/[own-meal]; demo recipes keep theirs.
import { Analytics } from "@vercel/analytics/next";
import { hidePrivatePath } from "../lib/site";

export default function SiteAnalytics({ demoSlugs }) {
  return <Analytics beforeSend={(event) => ({ ...event, url: hidePrivatePath(event.url, demoSlugs) })} />;
}
