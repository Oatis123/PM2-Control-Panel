/** @type {import('tailwindcss').Config} */
// oatis-style tokens live in src/styles/globals.css as CSS variables
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,html}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        'moss-wash': 'var(--moss-wash)',
        'ochre-wash': 'var(--ochre-wash)',
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
        serif: 'var(--font-prose)',
        code: 'var(--font-code)'
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        full: 'var(--r-pill)'
      }
    }
  },
  plugins: []
}
