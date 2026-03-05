/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        base: {
          950: '#0a0c10',
          900: '#0f1218',
          800: '#161a24',
          700: '#1e2330',
          600: '#2a3040',
        },
        accent: {
          DEFAULT: '#22d3ee',
          dim: '#0e7490',
        },
        gap: {
          high: '#ef4444',
          mid: '#f59e0b',
          low: '#6b7280',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
