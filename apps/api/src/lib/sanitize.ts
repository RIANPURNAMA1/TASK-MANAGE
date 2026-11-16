import sanitizeHtml from 'sanitize-html';

/** Only plain color values may survive in inline styles (no url(), expression(), etc.). */
const COLOR = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i,
  /^inherit$/i,
];

/**
 * Allow-list for the rich-text editor output (tiptap StarterKit, Link, Underline, Highlight,
 * Color, Table and TaskList). Everything else — scripts, styles, event handlers, iframes — is
 * stripped (PRD §8). Keep in sync with the extensions in DescriptionEditor.tsx.
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'hr', 'a',
    'span', 'mark', 'div', 'label', 'input',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
  ],
  allowedAttributes: {
    a: ['href', 'target', 'rel'],
    ul: ['data-type'],
    li: ['data-type', 'data-checked'],
    // Task-list checkboxes; sanitize-html drops any other input type below.
    input: ['type', 'checked', 'disabled'],
    span: ['style'],
    mark: ['style', 'data-color'],
    th: ['colspan', 'rowspan', 'colwidth'],
    td: ['colspan', 'rowspan', 'colwidth'],
    col: ['style'],
    pre: ['class'],
    code: ['class'],
  },
  allowedStyles: {
    span: { color: COLOR, 'background-color': COLOR },
    mark: { color: COLOR, 'background-color': COLOR },
    col: { width: [/^\d{1,4}(px|%)$/], 'min-width': [/^\d{1,4}(px|%)$/] },
  },
  allowedClasses: { pre: [/^language-[\w-]+$/], code: [/^language-[\w-]+$/] },
  allowedSchemes: ['http', 'https', 'mailto'],
  exclusiveFilter: (frame) => frame.tag === 'input' && frame.attribs.type !== 'checkbox',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer nofollow' }),
  },
};

export function sanitizeRichText(html: string | null): string | null {
  if (html === null) return null;
  const clean = sanitizeHtml(html, RICH_TEXT_OPTIONS).trim();
  // An editor emptied by the user produces "<p></p>"; store that as no description.
  return clean.replace(/<p>\s*<\/p>/g, '') === '' ? null : clean;
}

/** Plain-text fields (comments) never contain markup; strip all of it. */
export function stripHtml(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}
