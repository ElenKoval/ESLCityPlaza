import sanitizeHtml from "sanitize-html";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "ul", "ol", "li"],
  allowedAttributes: {},
  allowedSchemes: [],
  disallowedTagsMode: "discard",
};

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
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
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

export function stripTopicHtml(content: string) {
  if (!content.trim()) return "";
  return sanitizeHtml(content, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\s+/g, " ")
    .trim();
}

export function topicContentPlainLength(content: string) {
  return stripTopicHtml(content).length;
}
