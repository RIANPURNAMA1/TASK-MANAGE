import { describe, expect, it } from 'vitest';
import { descriptionExcerpt } from './board.mapper';

describe('descriptionExcerpt', () => {
  it('turns sanitized HTML into a single line of plain text', () => {
    expect(descriptionExcerpt('<p>Halo <strong>tim</strong></p><ul><li>satu</li><li>dua</li></ul>')).toBe(
      'Halo tim satu dua',
    );
  });

  it('decodes the entities the sanitizer produces', () => {
    expect(descriptionExcerpt('<p>A &amp; B &lt;3 &quot;ok&quot;</p>')).toBe('A & B <3 "ok"');
  });

  it('returns null for empty descriptions', () => {
    expect(descriptionExcerpt(null)).toBeNull();
    expect(descriptionExcerpt('<p> </p>')).toBeNull();
  });

  it('truncates long text with an ellipsis', () => {
    const result = descriptionExcerpt(`<p>${'kata '.repeat(100)}</p>`)!;
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith('…')).toBe(true);
  });
});
