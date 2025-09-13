// Tailwind minimal + plugin resmi (forms, typography, line-clamp, aspect-ratio)
// Scan hanya apps/**/*.{html,ts,tsx} agar build tetap ringan.

import forms from '@tailwindcss/forms'
import typography from '@tailwindcss/typography'
import lineClamp from '@tailwindcss/line-clamp'
import aspectRatio from '@tailwindcss/aspect-ratio'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./apps/**/*.{html,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {}
  },
  plugins: [forms, typography, lineClamp, aspectRatio]
}
