/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./bontot_weather.tsx"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cyan: {
          450: '#00e5ff',
        }
      }
    },
  },
  plugins: [],
}
