/**
 * Plain-text helpers for metadata built from authored HTML (static pages).
 */

/** Google truncates snippets around here; longer descriptions are wasted. */
export const META_DESCRIPTION_MAX_LENGTH = 155;

/**
 * The handful of entities a rich-text editor actually emits. Anything else is
 * left as written — a stray `&hellip;` in a description is cosmetic, and a full
 * entity table is not worth carrying for it.
 */
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/**
 * Collapses `html` into a single line of text no longer than `maxLength`,
 * cutting at a word boundary and marking the cut with an ellipsis.
 *
 * Tags become spaces rather than nothing, so `<p>One</p><p>Two</p>` reads
 * "One Two" instead of "OneTwo". This is for a `<meta>` attribute, which React
 * escapes, so it does not need to be — and is not — an HTML sanitiser.
 */
export function plainTextExcerpt(
  html: string,
  maxLength: number = META_DESCRIPTION_MAX_LENGTH,
): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (entity) => {
      return HTML_ENTITIES[entity] ?? entity;
    })
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  // Leave room for the ellipsis, then back off to the last whole word so the
  // snippet never ends mid-word.
  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;

  return `${trimmed.replace(/[\s.,;:—-]+$/, "")}…`;
}
