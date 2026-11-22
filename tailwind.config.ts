import type { Config } from 'tailwindcss';

/**
 * Direction artistique — "La Sappe Authentique"
 * Inspirée de la culture de la Sape : élégance, audace, matières nobles.
 * Encre profonde + papier ivoire + laiton, accent bordeaux.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0C0C0E',
          900: '#121216',
          800: '#1A1A20',
          700: '#24242C',
          600: '#33333D',
          500: '#4A4A57',
          400: '#6E6E7E',
          300: '#9A9AA8',
        },
        ivory: {
          DEFAULT: '#F8F5EF',
          200: '#F2EDE3',
          300: '#E7DFD1',
          400: '#D6CAB6',
        },
        brass: {
          DEFAULT: '#C19A3E',
          light: '#E0BE68',
          dark: '#96742A',
          soft: '#F5EBD6',
        },
        bordeaux: {
          DEFAULT: '#6E1F30',
          light: '#8E3448',
          soft: '#F6E6E9',
        },
        sage: { DEFAULT: '#3F6B52', soft: '#E8F0EA' },
        signal: {
          success: '#2F7A54',
          warning: '#B9801F',
          danger: '#A8322C',
          info: '#2A5A8C',
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        'display-xl': ['clamp(2.75rem, 7vw, 5.5rem)', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(2.25rem, 5vw, 3.75rem)', { lineHeight: '1', letterSpacing: '-0.025em' }],
        'display-md': ['clamp(1.75rem, 3.5vw, 2.5rem)', { lineHeight: '1.08', letterSpacing: '-0.02em' }],
      },
      borderRadius: { xs: '2px', sm: '4px', DEFAULT: '6px', lg: '10px', xl: '16px', '2xl': '24px' },
      boxShadow: {
        card: '0 1px 2px rgba(12,12,14,0.04), 0 8px 24px -12px rgba(12,12,14,0.12)',
        lift: '0 2px 4px rgba(12,12,14,0.05), 0 18px 48px -16px rgba(12,12,14,0.22)',
        inset: 'inset 0 1px 0 rgba(255,255,255,0.06)',
      },
      transitionTimingFunction: { silk: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(12px)' }, '100%': { opacity: '1', transform: 'none' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.4s ease both',
        marquee: 'marquee 30s linear infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
