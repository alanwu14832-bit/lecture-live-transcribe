import type { Config } from "tailwindcss";

// 顏色一律指向 CSS variables（見 src/styles/tokens.css），
// 元件裡只寫語意名稱（bg-surface、text-secondary），不出現 hex。
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        primary: "var(--color-text-primary)",
        secondary: "var(--color-text-secondary)",
        border: "var(--color-border)",
        brand: "var(--color-brand)",
        "brand-soft": "var(--color-brand-soft)",
        recording: "var(--color-recording)",
        "recording-soft": "var(--color-recording-soft)",
        success: "var(--color-success)",
        "success-soft": "var(--color-success-soft)",
        warning: "var(--color-warning)",
        "warning-soft": "var(--color-warning-soft)",
      },
      fontFamily: {
        sans: ["Inter", "Noto Sans TC", "system-ui", "-apple-system", "Segoe UI", "PingFang TC", "Microsoft JhengHei", "sans-serif"],
      },
      borderRadius: {
        control: "var(--radius-control)",
        container: "var(--radius-container)",
      },
      boxShadow: {
        overlay: "var(--shadow-overlay)",
      },
      maxWidth: {
        reading: "var(--reading-max-width)",
      },
    },
  },
  plugins: [],
};

export default config;
