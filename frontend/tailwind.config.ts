import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          DEFAULT: '#00bcd4',
          light: '#4dd0e1',
          dark: '#0097a7',
        },
      },
    },
  },
  plugins: [],
}
export default config

