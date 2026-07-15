// =============================================================================
// tailwind.config.js — Tailwind + دعم RTL + خط Cairo
// CommonJS (package.json "type": "commonjs"). The tailwindcss-rtl plugin flips
// logical spacing utilities (ms-*/me-*) for right-to-left layouts.
// =============================================================================

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './renderer/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Cairo', 'Tahoma', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#0ea5e9',
          dark: '#0284c7',
        },
      },
    },
  },
  plugins: [require('tailwindcss-rtl')],
};
