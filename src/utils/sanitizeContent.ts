import sanitizeHtml from "sanitize-html";

/**
 * Cleans admin-authored rich text (blogs, landing pages, content pages):
 * keeps headings H1–H6, links, images with alt text, lists, tables and basic
 * formatting; strips scripts, inline handlers and styles.
 */
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "figure", "figcaption", "u", "s"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ["src", "alt", "title", "width", "height", "loading"],
      a: ["href", "name", "target", "rel", "title"],
    },
  });
}
