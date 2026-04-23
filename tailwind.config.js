/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Yellow gold for stats + accents.
        accent: {
          DEFAULT: '#fbbf24',   // amber-400, reads warm gold on navy
          soft: '#fde68a',      // highlights / hover glyphs
          muted: '#d97706',     // dense states
        },
        // Navy palette used across the dashboard surface.
        navy: {
          50:  '#e6edf9',
          100: '#c7d5ec',
          200: '#9aaed4',
          300: '#6d87bd',
          400: '#405fa5',
          500: '#2a4785',
          600: '#1d3467',
          700: '#152549',
          800: '#101c38',
          900: '#0a1329',
          950: '#060d20',
        },
      },
    },
  },
  plugins: [],
}
