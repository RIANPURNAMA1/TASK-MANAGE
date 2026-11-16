/**
 * Text color that stays readable on a user-chosen background (WCAG relative luminance).
 * Labels and projects have arbitrary hex colors, so contrast can't be fixed at design time.
 */
export function readableTextOn(hex: string): '#FFFFFF' | '#0F172A' {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) return '#FFFFFF';
  const value = parseInt(match[1]!, 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0);
  // Contrast with white beats contrast with near-black below ~0.18 luminance… but brand
  // hues (blue, green, orange) read better with white, so bias towards white.
  return luminance > 0.45 ? '#0F172A' : '#FFFFFF';
}
