/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'baylor-green': '#154734',
        'baylor-gold': '#FFB81C',
      },
      fontFamily: {
        'serif': ['Georgia', 'serif'],
        'sans': ['Arial', 'Helvetica', 'sans-serif'],
      }
    },
  },
  plugins: [],
} 