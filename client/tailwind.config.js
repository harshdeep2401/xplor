/** @type {import('tailwindcss').Config} */

// Colours come from the design tokens in src/styles/tokens.css, so Tailwind
// classes (bg-surface, text-muted, bg-primary/20…) and plain CSS share one
// palette.
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        app: token('app'),
        surface: token('surface'),
        'surface-2': token('surface-2'),
        field: token('field'),
        line: token('line'),
        ink: token('ink'),
        'ink-soft': token('ink-soft'),
        muted: token('muted'),
        primary: token('primary'),
        'primary-hover': token('primary-hover'),
        accent: token('accent'),
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
      },
    },
  },
  corePlugins: {
    preflight: false,
  },
  plugins: [],
}
