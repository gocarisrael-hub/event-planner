/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Ocar brand — sampled from the logo (black + red star). Mirror in src/brand/brand.js.
        ocar: {
          DEFAULT: '#e00f19',
          dark: '#141414',
          accent: '#ff3b30',
          soft: '#fdecec',
        },
      },
    },
  },
  plugins: [],
};
