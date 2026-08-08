/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary — deep blue sampled from the PKM logo (~#0058A0).
        brand: {
          50: "#eef5fb",
          100: "#dceaf7",
          200: "#b7d5ef",
          300: "#8ab8df",
          400: "#5695c9",
          500: "#2e73ac",
          600: "#155a93",
          700: "#0b4a7b",
          800: "#093a63",
          900: "#0a2f4f",
          950: "#061b30",
        },
        // Accent — muted/soft green sampled from the PKM logo (~#80B838), desaturated for UI use.
        accent: {
          50: "#f4f8ed",
          100: "#e7f0da",
          200: "#d0e2b7",
          300: "#b0ce88",
          400: "#93bc64",
          500: "#79a94a",
          600: "#628f39",
          700: "#4e722e",
          800: "#405c26",
          900: "#354b20",
        },
        ink: {
          50: "#f5f6f7",
          100: "#e7e9eb",
          200: "#cdd2d6",
          300: "#a7afb6",
          400: "#7a8590",
          500: "#5f6a74",
          600: "#4d5760",
          700: "#40474f",
          800: "#383d43",
          900: "#26292d",
        },
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      maxWidth: {
        "8xl": "88rem",
      },
    },
  },
  plugins: [],
};
