export const CHAT_FILE_BUCKET = "chat-files";
export const CHAT_FILE_MAX_BYTES = 256 * 1024;
export const CHAT_FILE_NAME_MAX = 80;
export const CHAT_FILE_PATH_RE =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.txt$/;

export type PreparedChatFile = {
  blob: Blob;
  name: string;
  mime: "text/plain";
};

function hasNullBytes(bytes: Uint8Array) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  return sample.includes(0);
}

export function isChatTextFile(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === "text/plain" ||
    type === "text/markdown" ||
    name.endsWith(".txt") ||
    name.endsWith(".text")
  );
}

export function sanitizeChatFileName(name: string) {
  const base = name.replace(/\\/g, "/").split("/").pop() || "note.txt";
  const cleaned = base.replace(/[^\w.\s()-]/g, "").replace(/\s+/g, " ").trim();
  const withExt = /\.(txt|text)$/i.test(cleaned) ? cleaned : `${cleaned || "note"}.txt`;
  return withExt.slice(0, CHAT_FILE_NAME_MAX);
}

export async function prepareChatFile(file: File): Promise<PreparedChatFile> {
  if (!isChatTextFile(file)) {
    throw new Error("Please choose a .txt file.");
  }
  if (file.size === 0) {
    throw new Error("That text file is empty.");
  }
  if (file.size > CHAT_FILE_MAX_BYTES) {
    throw new Error("That text file is too large. Please choose one under 256 KB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (hasNullBytes(bytes)) {
    throw new Error("That file does not look like a text file.");
  }
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!text.trim()) {
    throw new Error("That text file is empty.");
  }
  return {
    blob: new Blob([text], { type: "text/plain" }),
    name: sanitizeChatFileName(file.name),
    mime: "text/plain",
  };
}
