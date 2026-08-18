import DOMPurify from "isomorphic-dompurify";

const TOPIC_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "ul",
  "ol",
  "li",
] as const;

const TOPIC_ALLOWED_ATTR: string[] = [];

export function looksLikeTopicHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainTextToTopicHtml(text: string) {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";

  if (trimmed.includes("\n\n")) {
    return trimmed
      .split(/\n{2,}/)
      .map((block) => {
        const body = escapeHtml(block.trim()).replace(/\n/g, "<br>");
        return body ? `<p>${body}</p>` : "";
      })
      .filter(Boolean)
      .join("");
  }

  return `<p>${escapeHtml(trimmed).replace(/\n/g, "<br>")}</p>`;
}

export function sanitizeTopicHtml(html: string) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [...TOPIC_ALLOWED_TAGS],
    ALLOWED_ATTR: TOPIC_ALLOWED_ATTR,
  }).trim();
}

export function topicContentToEditorHtml(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return "";
  if (looksLikeTopicHtml(trimmed)) return sanitizeTopicHtml(trimmed);
  return plainTextToTopicHtml(trimmed);
}

export function topicContentToDisplayHtml(content: string) {
  return topicContentToEditorHtml(content);
}

export function topicContentPlainLength(content: string) {
  if (!content.trim()) return 0;
  if (looksLikeTopicHtml(content)) {
    return DOMPurify.sanitize(content, { ALLOWED_TAGS: [] }).replace(/\s+/g, " ").trim()
      .length;
  }
  return content.trim().length;
}

export function stripTopicHtml(content: string) {
  if (!content.trim()) return "";
  if (looksLikeTopicHtml(content)) {
    return DOMPurify.sanitize(content, { ALLOWED_TAGS: [] })
      .replace(/\s+/g, " ")
      .trim();
  }
  return content.replace(/\s+/g, " ").trim();
}
