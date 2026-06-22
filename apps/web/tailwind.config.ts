import type { Config } from 'tailwindcss';

// Mirrors the inline Tailwind config that shipped with the legacy single-file
// app. Same fonts, same custom palettes — the visual regression baselines
// from PR 2.3 require the emitted CSS to be byte-identical for any class
// the legacy code already uses.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Lora', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#0a0a0c',
          900: '#101014',
          800: '#16161c',
          700: '#1d1d25',
          600: '#2a2a34',
        },
        gold: {
          DEFAULT: '#d4a574',
          soft: '#c9a572',
          deep: '#a8814f',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
