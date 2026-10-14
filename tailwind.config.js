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
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        paper: '#FAFAF9',
        surface: '#FFFFFF',
        ink: '#111113',
        muted: '#71717A',
        faint: '#A1A1AA',
        line: '#E9E7E3',
        line2: '#D9D6D1',
        soft: '#F4F4F1',
        accent: '#FACC15',
        'accent-soft': '#FEF9C3',
        ok: '#16A34A',
        'ok-soft': '#EAF7EE',
        danger: '#DC2626',
        'danger-soft': '#FEF0F0',
      },
      boxShadow: {
        s: '0 1px 2px rgba(17,17,19,.05)',
        m: '0 1px 2px rgba(17,17,19,.04), 0 12px 28px -18px rgba(17,17,19,.35)',
        l: '0 24px 60px -28px rgba(17,17,19,.45)',
      },
      borderRadius: {
        s: '8px',
        m: '12px',
        l: '18px',
        xl: '24px',
      },
      screens: {
        xs: '480px',
        wide: '620px',
        desk: '760px',
      },
      keyframes: {
        pulse: { '50%': { opacity: '0.25' } },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
      },
      animation: {
        pulse: 'pulse 1.6s infinite',
        'fade-in': 'fade-in 0.3s ease-out both',
      },
    },
  },
  plugins: [],
};