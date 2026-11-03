import { Caveat, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";
import SiteAnalytics from "../components/SiteAnalytics";
import { loadDemoMeals } from "../lib/demo";
import { SITE_URL } from "../lib/site";

const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-caveat" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"], variable: "--font-playfair" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-jakarta" });

const title = "SmartBite - whole-pack meal planner";
const description = "One meal in: a recipe in grams, a shopping list in whole packs, macros computed in code.";

// Link previews (LinkedIn, WhatsApp, X): app/opengraph-image.png is the shared picture
export const metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  openGraph: { type: "website", siteName: "SmartBite", title, description, url: "/" },
  twitter: { card: "summary_large_image", title, description },
};

// Front door (decided 2026-11-03): a browser with no SmartBite storage at all (no "smartbite." key in localStorage)
// that opens "/" with no ?tab= goes to /start first, to pick API key, demo or profile file. /start sets
// smartbite.startSeen, so it happens once. It runs in <head> before the page paints and hides it while the browser
// moves on, so Home never flashes. Blocked storage: no redirect. Client-side moves to "/" never run it.
const FRONT_DOOR = `(function(){try{if(location.pathname!=="/"||/[?&]tab=/.test(location.search))return;var s=window.localStorage;
for(var i=0;i<s.length;i++){if((s.key(i)||"").indexOf("smartbite.")===0)return}
document.documentElement.style.visibility="hidden";location.replace("/start")}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${caveat.variable} ${playfair.variable} ${jakarta.variable}`}>
      <head>
        <script id="front-door" dangerouslySetInnerHTML={{ __html: FRONT_DOOR }} />
      </head>
      <body className="bg-cream text-forest selection:bg-lime selection:text-forest">
        {children}
        {/* Only on Vercel: a copy run elsewhere has no analytics endpoint */}
        {process.env.VERCEL ? <SiteAnalytics demoSlugs={loadDemoMeals().map((m) => m.slug)} /> : null}
      </body>
    </html>
  );
}
