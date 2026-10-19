import { Caveat, Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import "@fortawesome/fontawesome-free/css/all.min.css";
import "./globals.css";

const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-caveat" });
const playfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"], variable: "--font-playfair" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-jakarta" });

export const metadata = {
  title: "SmartBite - whole-pack meal planner",
  description: "One meal in: a recipe in grams, a shopping list in whole packs, macros computed in code.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${caveat.variable} ${playfair.variable} ${jakarta.variable}`}>
      <body className="bg-cream text-forest selection:bg-lime selection:text-forest">{children}</body>
    </html>
  );
}
