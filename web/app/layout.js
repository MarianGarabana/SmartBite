import { Caveat, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
// Font Awesome trimmed to the icons the app uses (solid + regular): run scripts/subset-icons.py after adding an icon
import "./icons/fontawesome.css";
import "./globals.css";
import LangSync from "../components/LangSync";
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

// Before paint (lib/i18n.js): <html lang> from the stored choice or the browser language, and for Spanish the page
// hidden until LangSync has switched it (2 s at most), so the English server HTML never flashes. No cookie.
const LANG_SCRIPT = `(function(){try{var d=document.documentElement,l=null;try{l=JSON.parse(localStorage.getItem("smartbite.lang")||"null")}catch(e){}
if(l!=="en"&&l!=="es")l=String(navigator.language||"").toLowerCase().indexOf("es")===0?"es":"en";d.lang=l;
if(l==="es"){d.classList.add("lang-wait");setTimeout(function(){d.classList.remove("lang-wait")},2000)}}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${caveat.variable} ${playfair.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_SCRIPT }} />
      </head>
      <body className="bg-cream text-forest selection:bg-lime selection:text-forest">
        <LangSync />
        {children}
        {/* Only on Vercel: a copy run elsewhere has no analytics endpoint */}
        {process.env.VERCEL ? <SiteAnalytics demoSlugs={loadDemoMeals().map((m) => m.slug)} /> : null}
      </body>
    </html>
  );
}
