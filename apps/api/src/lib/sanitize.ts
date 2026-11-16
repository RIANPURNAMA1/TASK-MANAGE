import sanitizeHtml from 'sanitize-html';

/**
 * Allow-list for the rich-text editor output (tiptap StarterKit + Link).
 * Everything else — scripts, styles, event handlers, iframes — is stripped (PRD §8).
 */
const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'hr', 'a',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
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
