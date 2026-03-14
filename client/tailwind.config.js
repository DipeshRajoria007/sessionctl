/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'sctl': {
          bg: '#1a1b26',
          surface: '#24283b',
          surfaceHover: '#292e42',
          border: '#3b4261',
          text: '#c0caf5',
          textMuted: '#565f89',
          accent: '#7aa2f7',
          accentHover: '#89b4fa',
          green: '#9ece6a',
          red: '#f7768e',
          yellow: '#e0af68',
          purple: '#bb9af7',
          cyan: '#7dcfff',
          orange: '#ff9e64',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
