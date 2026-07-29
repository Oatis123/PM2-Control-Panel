/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#09090b',
          raised: '#18181b',
          panel: '#27272a',
          border: '#3f3f46'
        },
        ink: {
          DEFAULT: '#f4f3f0',
          muted: '#71717a',
          faint: '#52525b'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'ui-monospace', 'monospace']
      }
    }
  },
  plugins: []
}
