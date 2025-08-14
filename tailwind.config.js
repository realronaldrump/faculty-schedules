/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Baylor University Brand Colors
        'baylor-green': {
          DEFAULT: '#154734',
          50: '#f0f8f4',
          100: '#dceee6',
          200: '#bcddd0',
          300: '#8fc5b2',
          400: '#5ea68f',
          500: '#3d8b73',
          600: '#2d705c',
          700: '#26594c',
          800: '#22473f',
          900: '#1f3c36',
          950: '#0f211d',
        },
        'baylor-gold': {
          DEFAULT: '#FFB81C',
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
        // Additional Baylor colors for expanded palette
        'baylor-blue': '#003F5C',
        'baylor-silver': '#8D8D8D',
        'baylor-charcoal': '#383838',
        'charcoal': '#383838',
        'light-gray': '#eeeeee',
        'link-green': '#006A52',
        'link-green-hover': '#154734',
      },
      fontFamily: {
        // Baylor University Brand Typography
        // Use Calluna universally for a consistent Baylor feel
        'sans': [
          'calluna',
          'Georgia',
          'ui-serif',
          'serif'
        ],
        'serif': [
          'calluna',
          'Georgia',
          'Cambria',
          'Times New Roman',
          'Times',
          'serif'
        ],
        'display': [
          'calluna',
          'Georgia',
          'ui-serif',
          'serif'
        ],
        // Monospace fonts for code
        'mono': [
          'ui-monospace',
          'SFMono-Regular',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace'
        ]
      },
      fontSize: {
        // Extended font size scale
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        '6xl': ['3.75rem', { lineHeight: '1' }],
        '7xl': ['4.5rem', { lineHeight: '1' }],
        '8xl': ['6rem', { lineHeight: '1' }],
        '9xl': ['8rem', { lineHeight: '1' }],
      },
      spacing: {
        // Additional spacing values
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
        '144': '36rem',
      },
      maxWidth: {
        // Custom max widths
        '8xl': '88rem',
        '9xl': '96rem',
      },
      animation: {
        // Custom animations
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'shake': 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
        'pulse-slow': 'pulse 3s infinite',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shake: {
          '10%, 90%': { transform: 'translate3d(-1px, 0, 0)' },
          '20%, 80%': { transform: 'translate3d(2px, 0, 0)' },
          '30%, 50%, 70%': { transform: 'translate3d(-4px, 0, 0)' },
          '40%, 60%': { transform: 'translate3d(4px, 0, 0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        // Custom shadows
        'baylor': '0 4px 6px -1px rgba(21, 71, 52, 0.1), 0 2px 4px -1px rgba(21, 71, 52, 0.06)',
        'gold': '0 4px 6px -1px rgba(255, 184, 28, 0.1), 0 2px 4px -1px rgba(255, 184, 28, 0.06)',
        'inner-baylor': 'inset 0 2px 4px 0 rgba(21, 71, 52, 0.06)',
      },
      borderRadius: {
        // Additional border radius values
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      backdropBlur: {
        xs: '2px',
      },
      screens: {
        // Custom breakpoints
        'xs': '475px',
        '3xl': '1600px',
      },
      zIndex: {
        // Custom z-index values
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },
      transitionProperty: {
        // Custom transition properties
        'height': 'height',
        'spacing': 'margin, padding',
      },
      transitionDuration: {
        // Additional durations
        '0': '0ms',
        '2000': '2000ms',
      },
      opacity: {
        // Additional opacity values
        '15': '0.15',
        '35': '0.35',
        '65': '0.65',
        '85': '0.85',
      },
      scale: {
        // Additional scale values
        '102': '1.02',
        '103': '1.03',
        '98': '0.98',
        '97': '0.97',
      },
      blur: {
        xs: '2px',
      },
      grayscale: {
        50: '0.5',
      },
      brightness: {
        25: '.25',
        175: '1.75',
      },
    },
  },
  plugins: [
    // Form plugin for better form styling
    require('@tailwindcss/forms')({
      strategy: 'class', // Use 'class' strategy to avoid conflicts
    }),
    // Typography plugin for rich text content
    require('@tailwindcss/typography'),
    // Container queries plugin
    require('@tailwindcss/container-queries'),
  ],
  // Safelist for dynamic classes that might not be detected
  safelist: [
    // Baylor color classes
    'bg-baylor-green',
    'bg-baylor-green/5',
    'bg-baylor-green/10',
    'bg-baylor-green/20',
    'bg-baylor-gold',
    'bg-baylor-gold/5',
    'bg-baylor-gold/10',
    'bg-baylor-gold/20',
    'text-baylor-green',
    'text-baylor-gold',
    'border-baylor-green',
    'border-baylor-gold',
    'hover:bg-baylor-green',
    'hover:bg-baylor-gold',
    'hover:text-baylor-green',
    'hover:text-baylor-gold',
    // Animation classes
    'animate-fade-in',
    'animate-slide-up',
    'animate-scale-in',
    'animate-shake',
    // Common utility classes
    'opacity-0',
    'opacity-100',
    'transform',
    'transition-all',
    'duration-200',
    'duration-300',
    'duration-500',
    // Grid classes that might be dynamic
    'grid-cols-1',
    'grid-cols-2',
    'grid-cols-3',
    'grid-cols-4',
    'grid-cols-5',
    'grid-cols-6',
    'md:grid-cols-2',
    'md:grid-cols-3',
    'md:grid-cols-4',
    'lg:grid-cols-3',
    'lg:grid-cols-4',
    'lg:grid-cols-5',
  ],
}