import { describe, expect, it } from 'vitest';
import { sanitizeRichText } from './sanitize';

describe('sanitizeRichText', () => {
  it('keeps headings, tables, task lists and colors that the editor produces', () => {
    const html =
      '<h1>Judul</h1>' +
      '<table><tbody><tr><th colspan="1" rowspan="1"><p>A</p></th><td colspan="2" rowspan="1"><p>B</p></td></tr></tbody></table>' +
      '<ul data-type="taskList"><li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>Selesai</p></div></li></ul>' +
      '<p><span style="color: #ff0000">merah</span> <mark data-color="#fef08a" style="background-color: #fef08a; color: inherit">sorot</mark></p>';
    const out = sanitizeRichText(html)!;
    expect(out).toContain('<h1>Judul</h1>');
    expect(out).toContain('<table>');
    expect(out).toContain('colspan="2"');
    expect(out).toContain('data-type="taskList"');
    expect(out).toContain('data-checked="true"');
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('color:#ff0000');
    expect(out).toContain('<mark');
  });

  it('still strips scripts, handlers, non-checkbox inputs and unsafe styles', () => {
    const out = sanitizeRichText(
      '<p onclick="x()">a<script>alert(1)</script></p><input type="text" value="x"><span style="background:url(javascript:1);color:red">b</span><a href="javascript:alert(1)">c</a>',
    )!;
    expect(out).not.toContain('script');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('type="text"');
    expect(out).not.toContain('url(');
    expect(out).not.toContain('javascript:');
  });
});
