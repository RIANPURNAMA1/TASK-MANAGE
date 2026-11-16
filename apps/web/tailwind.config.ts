import type { Config } from 'tailwindcss';

/**
 * Design tokens from DESIGN.md. Components use these semantic names
 * (`bg-brand`, `text-ink-muted`, `border-line`…) — never raw hex values.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0070F3',
          hover: '#0051C6',
          strong: '#1D4ED8',
          subtle: '#EFF6FF',
          soft: '#F0F7FF',
          border: '#BFDBFE',
        },
        canvas: { DEFAULT: '#F8FAFC', deep: '#F1F5F9' },
        surface: '#FFFFFF',
        ink: { DEFAULT: '#0F172A', muted: '#475569', subtle: '#64748B' },
        line: { DEFAULT: '#E2E8F0', subtle: '#F1F5F9', strong: '#CBD5E1', focus: '#93C5FD' },
        success: { DEFAULT: '#10B981', soft: '#ECFDF5', ink: '#065F46' },
        warning: { DEFAULT: '#F59E0B', soft: '#FEF3C7', ink: '#92400E' },
        danger: { DEFAULT: '#EF4444', soft: '#FEF2F2', ink: '#991B1B' },
        info: { DEFAULT: '#3B82F6', soft: '#EFF6FF', ink: '#1E40AF' },
      },
      fontFamily: {
        sans: [
          'Nunito',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      /*
       * Type scale (Nunito):
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
       * Nunito is loaded at 400/500/600 only. Heavier utilities collapse to 600
       * and `semibold` reads as 500 so UI labels stay at the "medium" weight.
       */
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '500',
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
