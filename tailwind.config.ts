import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Instrument Serif", "Georgia", "serif"],
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "JetBrains Mono", "SF Mono", "monospace"],
        heading: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          brand: "hsl(var(--accent-brand))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        risk: {
          critical: "hsl(var(--risk-critical))",
          high: "hsl(var(--risk-high))",
          medium: "hsl(var(--risk-medium))",
          low: "hsl(var(--risk-low))",
        },
        attention: "hsl(var(--attention))",
        c: {
          'navy-950': 'var(--c-navy-950)',
          'navy-900': 'var(--c-navy-900)',
          'navy-800': 'var(--c-navy-800)',
          'navy-100': 'var(--c-navy-100)',
          'navy-50': 'var(--c-navy-50)',
          'teal': 'var(--c-teal)',
          'teal-soft': 'var(--c-teal-soft)',
          'white': 'var(--c-white)',
          'snow': 'var(--c-snow)',
          'gray-50': 'var(--c-gray-50)',
          'gray-100': 'var(--c-gray-100)',
          'gray-200': 'var(--c-gray-200)',
          'gray-300': 'var(--c-gray-300)',
          'gray-500': 'var(--c-gray-500)',
          'gray-700': 'var(--c-gray-700)',
          'gray-900': 'var(--c-gray-900)',
          'gray-950': 'var(--c-gray-950)',
          'danger': 'var(--c-danger)',
          'danger-soft': 'var(--c-danger-soft)',
          'warning': 'var(--c-warning)',
          'warning-soft': 'var(--c-warning-soft)',
          'success': 'var(--c-success)',
          'success-soft': 'var(--c-success-soft)',
          'info': 'var(--c-info)',
          'info-soft': 'var(--c-info-soft)',
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
export default config
