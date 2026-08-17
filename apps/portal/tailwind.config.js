/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary — deep blue sampled from the PKM logo (~#0058A0), same scale as apps/web.
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
        // Management shell canvas (Bumi Indah–like light admin surface).
        canvas: {
          DEFAULT: "#EEF1F9",
        },
      },
      spacing: {
        "sidebar-expanded": "248px",
        "sidebar-collapsed": "72px",
      },
      width: {
        "sidebar-expanded": "248px",
        "sidebar-collapsed": "72px",
      },
      margin: {
        "sidebar-expanded": "248px",
        "sidebar-collapsed": "72px",
      },
      borderRadius: {
        shell: "0.5rem",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
