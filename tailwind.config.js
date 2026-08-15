/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-outfit)', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // Base neutrals
        paper: '#FBFBF9',
        ink: '#141414',
        muted: '#6B6B66',
        line: '#141414',
        // Single signature accent
        accent: '#FFD100',
        // Semantic states only
        ok: '#3FA34D',
        danger: '#E11D48',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
      boxShadow: {
        'neo': '3px 3px 0px 0px #141414',
        'neo-lg': '5px 5px 0px 0px #141414',
        'neo-hover': '2px 2px 0px 0px #141414',
      },
      borderWidth: {
        '3': '3px',
      },
      screens: {
        'xs': '480px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out both',
        'fade-in-up': 'fade-in-up 0.4s ease-out both',
        'toast-in': 'toast-in 0.2s ease-out forwards',
      },
    },
  },
  plugins: [],
}
