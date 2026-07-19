import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        "brand-fuchsia": "#ff00ff",
        "brand-purple": "#a855f7",
        "brand-cyan": "#22d3ee",
        "brand-amber": "#ffbf00",
        "brand-orange": "#ff8c00",
        "fewer-background": "var(--fewer-background)",
        "fewer-text": "var(--fewer-text)",
        "fewer-text-subtle": "var(--fewer-text-subtle)",
        "fewer-item-hover": "var(--fewer-item-hover)",
        "fewer-handle": "var(--fewer-handle)",
        "fewer-edge": "var(--fewer-edge)",
        "fewer-folder-bg": "var(--fewer-folder-bg)",
        "fewer-folder-border": "var(--fewer-folder-border)",
        "fewer-folder-header-bg": "var(--fewer-folder-header-bg)",
        "fewer-folder-header-text": "var(--fewer-folder-header-text)",
        "fewer-folder-icon": "var(--fewer-folder-icon)",
        "fewer-file-bg": "var(--fewer-file-bg)",
        "fewer-file-border": "var(--fewer-file-border)",
        "fewer-file-icon": "var(--fewer-file-icon)",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};
export default config;