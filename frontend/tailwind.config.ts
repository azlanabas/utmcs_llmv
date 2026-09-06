import type { Config } from 'tailwindcss'

// Colour VALUES live in app/globals.css as CSS custom properties — see
// docs/color-scheme.md. Tailwind only references them, so a recolor is a
// token swap with zero markup change.
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface:   'var(--surface)',
        surface2:  'var(--surface-2)',
        border:    'var(--border)',
        primary:   'var(--primary)',
        secondary: 'var(--secondary)',
        cta:       'var(--cta)',
        ink:       'var(--ink)',
        ink2:      'var(--ink-2)',
        ink3:      'var(--ink-3)',
        quant2:    'var(--quant-2)',
        quant4:    'var(--quant-4)',
        quant8:    'var(--quant-8)',
        good:      'var(--status-good)',
        warn:      'var(--status-warn)',
        off:       'var(--status-off)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
