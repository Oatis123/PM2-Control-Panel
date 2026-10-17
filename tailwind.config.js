/** @type {import('tailwindcss').Config} */
// oatis-style tokens live in src/styles/globals.css as CSS variables
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        line: 'var(--line)',
        dim: 'var(--dim)',
        muted: 'var(--muted)',
        text: 'var(--text)',
        prose: 'var(--prose)',
        moss: 'var(--moss)',
        ochre: 'var(--ochre)',
        'on-accent': 'var(--on-accent)'
      },
      fontFamily: {
        px: ['Silkscreen', 'monospace'],
        ui: ['"Martian Mono"', '"JetBrains Mono"', 'monospace'],
        head: ['Commissioner', 'sans-serif'],
        serif: ['Literata', 'Georgia', 'serif'],
        code: ['"JetBrains Mono"', 'monospace']
      },
      borderRadius: { DEFAULT: '0', none: '0' }
    }
  },
  plugins: []
}
