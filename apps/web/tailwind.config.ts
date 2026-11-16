import type { Config } from 'tailwindcss';

/** Token backed by an RGB-triplet CSS variable, so `/50`-style opacity modifiers keep working. */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

/**
 * Design tokens from DESIGN.md. Components use these semantic names
 * (`bg-brand`, `text-ink-muted`, `border-line`…) — never raw hex values.
 * The values live in src/index.css (`:root` for light, `.dark` for dark mode).
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: v('brand'),
          hover: v('brand-hover'),
          strong: v('brand-strong'),
          subtle: v('brand-subtle'),
          soft: v('brand-soft'),
          border: v('brand-border'),
        },
        canvas: { DEFAULT: v('canvas'), deep: v('canvas-deep') },
        surface: v('surface'),
        ink: { DEFAULT: v('ink'), muted: v('ink-muted'), subtle: v('ink-subtle') },
        line: { DEFAULT: v('line'), subtle: v('line-subtle'), strong: v('line-strong'), focus: v('line-focus') },
        success: { DEFAULT: v('success'), soft: v('success-soft'), ink: v('success-ink') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft'), ink: v('warning-ink') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft'), ink: v('danger-ink') },
        info: { DEFAULT: v('info'), soft: v('info-soft'), ink: v('info-ink') },
      },
      fontFamily: {
        // Segoe UI ships with Windows (it can't be bundled), so macOS/Linux fall back to the system UI font.
        sans: [
          '"Segoe UI"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      /*
       * Type scale (Segoe UI):
       *   display/h2  — heading 20–24px, 600
       *   h3          — subheading 15px, 500
       *   body        — body & navigation 13px, 400 (14px via text-[0.875rem])
       *   caption     — label/metadata 12px, 400
       */
      fontSize: {
        display: ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.02em', fontWeight: '600' }],
        h2: ['1.25rem', { lineHeight: '1.35', letterSpacing: '-0.015em', fontWeight: '600' }],
        h3: ['0.9375rem', { lineHeight: '1.45', letterSpacing: '-0.005em', fontWeight: '500' }],
        body: ['0.8125rem', { lineHeight: '1.55' }],
        caption: ['0.75rem', { lineHeight: '1.45' }],
      },
      /*
       * Segoe UI has Regular 400, Semibold 600 and Bold 700 (no 500). `medium` therefore renders
       * as Regular; `semibold` and `bold` both use Semibold, and heavier utilities collapse to it.
       */
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '600',
        extrabold: '600',
        black: '600',
      },
      borderRadius: {
        kanban: '10px',
        modal: '16px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.04)',
        modal: '0 24px 48px -12px rgba(15, 23, 42, 0.25)',
      },
      spacing: {
        topbar: '60px',
        rail: '56px',
        subnav: '260px',
        drawer: '340px',
      },
    },
  },
  plugins: [],
} satisfies Config;
