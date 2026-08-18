import mammoth from "mammoth";
import {
  plainTextToTopicHtml,
  sanitizeTopicHtml,
  topicContentPlainLength,
} from "@/lib/topic-html";
import { CLASS_TOPIC_CONTENT_MAX } from "@/lib/class-topics";

export const TOPIC_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

function extension(name: string) {
  const match = name.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match?.[1] || "";
}

export async function importTopicFile(file: File): Promise<string> {
  if (file.size > TOPIC_IMPORT_MAX_BYTES) {
    throw new Error("That file is too large. Please choose one under 5 MB.");
  }

  const ext = extension(file.name);

  if (ext === ".txt" || file.type === "text/plain") {
    const text = await file.text();
    const html = plainTextToTopicHtml(text);
    if (topicContentPlainLength(html) > CLASS_TOPIC_CONTENT_MAX) {
      throw new Error("That file is too long for a class topic.");
    }
    return html;
  }

  if (
    ext === ".docx" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const buffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const html = sanitizeTopicHtml(result.value);
    if (!html) {
      throw new Error("That document did not contain any readable text.");
    }
    if (topicContentPlainLength(html) > CLASS_TOPIC_CONTENT_MAX) {
      throw new Error("That file is too long for a class topic.");
    }
    return html;
  }

  throw new Error("Please choose a .docx or .txt file.");
}
