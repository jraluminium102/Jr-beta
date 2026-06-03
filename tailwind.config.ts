import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: { xs: "480px" },
      colors: {
        brand: {
          DEFAULT: "#B3151D",
          dark: "#7d0f15",
          light: "#d83a42",
          soft: "#fdecec",
          navy: "#1F4E78",
        },
        ink: { DEFAULT: "#1f2127", 2: "#4b4f5a", 3: "#6b7280" },
      },
      fontFamily: {
        sans: ["Sarabun", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glass: "0 4px 12px rgba(31,33,39,.08), 0 2px 4px rgba(31,33,39,.04)",
        brand: "0 6px 16px rgba(179,21,29,.28)",
      },
    },
  },
  plugins: [],
};
export default config;
