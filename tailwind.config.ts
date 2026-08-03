import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--ar-bg)",
        surface: "var(--ar-surface)",
        panel: "var(--ar-panel)",
        accent: "#d4b24c",
        electric: "#7a1e2c",
        signal: "#d9a33b",
        success: "#16a34a",
        warning: "#d9a33b",
        danger: "#c2410c",
        ink: "var(--ar-ink)",
        muted: "var(--ar-muted)",
        gold: {
          DEFAULT: "#d4b24c",
          light: "#e5cf94",
          dark: "#b8860b",
        },
        maroon: {
          DEFAULT: "#7a1e2c",
          dark: "#5c1520",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Times New Roman", "Times", "Georgia", "serif"],
        mono: ["ui-monospace", "monospace"],
      },
      animation: {
        "pulse-glow": "pulse-glow 3s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 3s linear infinite",
        "brand-glow": "brand-glow 4s ease-in-out infinite",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% center" },
          "100%": { backgroundPosition: "-200% center" },
        },
        "brand-glow": {
          "0%, 100%": { opacity: "0.6", filter: "blur(12px)" },
          "50%": { opacity: "1", filter: "blur(20px)" },
        },
      },
      boxShadow: {
        neon: "0 0 40px -10px rgba(212, 178, 76, 0.45)",
        "neon-maroon": "0 0 40px -10px rgba(122, 30, 44, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
