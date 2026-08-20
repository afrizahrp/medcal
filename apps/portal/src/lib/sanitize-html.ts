import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitize untrusted inbound email HTML for Portal display.
 * Locked plan: Email → Lead Management §11.3.
 */
export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "b", "i", "u", "a", "ul", "ol", "li", "div", "span", "strong", "em"],
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}
