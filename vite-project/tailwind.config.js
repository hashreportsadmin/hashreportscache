/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        shrink: {
          '0%': { width: '100%' },
          '100%': { width: '0%' },
        },
      },
      animation: {
        'shrink-4s': 'shrink 4s linear forwards',
        'shrink-10s': 'shrink 10s linear forwards',
      },
    },
  },
  plugins: [],
}
