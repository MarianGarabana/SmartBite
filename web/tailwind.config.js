/** Tokens copied from the personal SmartBite mockup (same look, design freeze). */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        forest: "#0f2d24",
        "forest-light": "#184236",
        "forest-card": "#14382e",
        lime: "#70e000",
        "lime-hover": "#62c400",
        "lime-soft": "#ebfccb",
        cream: "#f9f8f3",
        "cream-card": "#f2f0e6",
        "cream-dark": "#e6e2d3",
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "serif"],
        sans: ["var(--font-jakarta)", "sans-serif"],
        script: ["var(--font-caveat)", "cursive"],
      },
      boxShadow: {
        soft: "0 10px 30px -5px rgba(15, 45, 36, 0.06)",
        card: "0 14px 35px -10px rgba(15, 45, 36, 0.1)",
        glow: "0 0 25px rgba(112, 224, 0, 0.35)",
      },
    },
  },
  plugins: [],
};
