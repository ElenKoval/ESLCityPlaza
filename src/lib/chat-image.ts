export const CHAT_IMAGE_BUCKET = "chat-images";
export const CHAT_IMAGE_MAX_EDGE = 1600;
export const CHAT_IMAGE_MAX_IN_BYTES = 20 * 1024 * 1024;
export const CHAT_IMAGE_MAX_OUT_BYTES = 5 * 1024 * 1024;
export const CHAT_IMAGE_TARGET_BYTES = 550_000;
export const CHAT_IMAGE_SIGNED_TTL_SEC = 60 * 60;

const ALLOWED_INPUT = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEIC_MIMES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "heif",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);

export const CHAT_IMAGE_PATH_RE =
  /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/;

const HEIC_PROCESS_ERROR =
  "This photo couldn’t be processed. Please try another photo.";

export type PreparedChatImage = {
  blob: Blob;
  width: number;
  height: number;
  ext: "webp" | "jpg";
  mime: "image/webp" | "image/jpeg";
};

type DecodedChatImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

export function isAllowedChatImageType(type: string) {
  return ALLOWED_INPUT.has(type);
}

function inferredImageType(file: File) {
  if (ALLOWED_INPUT.has(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  return file.type;
}

export function isHeicType(file: File) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    HEIC_MIMES.has(type) ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

function headerLooksLikeHeic(bytes: Uint8Array) {
  if (bytes.length < 12) return false;
  const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (ftyp !== "ftyp") return false;
  const brand = String.fromCharCode(
    bytes[8],
    bytes[9],
    bytes[10],
    bytes[11],
  ).toLowerCase();
  return HEIC_BRANDS.has(brand);
}

function orientedBitmapOptions(): ImageBitmapOptions {
  return { imageOrientation: "from-image" };
}

function loadImageElement(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo."));
    };
    img.src = url;
  });
}

async function decodeWithBrowser(source: Blob): Promise<DecodedChatImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(source, orientedBitmapOptions());
      if (bmp.width > 0 && bmp.height > 0) {
        return {
          source: bmp,
          width: bmp.width,
          height: bmp.height,
          close: () => bmp.close(),
        };
      }
      bmp.close();
    } catch {
      try {
        const bmp = await createImageBitmap(source);
        if (bmp.width > 0 && bmp.height > 0) {
          return {
            source: bmp,
            width: bmp.width,
            height: bmp.height,
            close: () => bmp.close(),
          };
        }
        bmp.close();
      } catch {
        // Native decoder cannot handle this format.
      }
    }
  }

  const img = await loadImageElement(source);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error("Could not read that photo.");
  }
  return { source: img, width, height };
}

async function decodePhoto(file: File, isHeic: boolean): Promise<DecodedChatImage> {
  try {
    return await decodeWithBrowser(file);
  } catch (error) {
    if (!isHeic) throw error;
  }

  try {
    const { convertHeicToDecoded } = await import("./chat-heic");
    return await convertHeicToDecoded(file);
  } catch {
    throw new Error(HEIC_PROCESS_ERROR);
  }
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mime, quality);
  });
}

async function encode(
  canvas: HTMLCanvasElement,
  preferWebp: boolean,
): Promise<{ blob: Blob; ext: "webp" | "jpg"; mime: "image/webp" | "image/jpeg" } | null> {
  const attempts: Array<{ mime: "image/webp" | "image/jpeg"; ext: "webp" | "jpg"; qualities: number[] }> =
    preferWebp
      ? [
          { mime: "image/webp", ext: "webp", qualities: [0.82, 0.72, 0.6, 0.5] },
          { mime: "image/jpeg", ext: "jpg", qualities: [0.82, 0.7, 0.58] },
        ]
      : [{ mime: "image/jpeg", ext: "jpg", qualities: [0.82, 0.7, 0.58] }];

  for (const attempt of attempts) {
    for (const quality of attempt.qualities) {
      const blob = await canvasToBlob(canvas, attempt.mime, quality);
      if (!blob || blob.size === 0) continue;
      if (attempt.mime === "image/webp" && blob.type && !blob.type.includes("webp")) {
        break;
      }
      if (blob.size <= CHAT_IMAGE_MAX_OUT_BYTES) {
        if (blob.size <= CHAT_IMAGE_TARGET_BYTES || quality === attempt.qualities.at(-1)) {
          return { blob, ext: attempt.ext, mime: attempt.mime };
        }
      }
    }
  }
  return null;
}

export async function prepareChatImage(file: File): Promise<PreparedChatImage> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const heic = isHeicType(file) || headerLooksLikeHeic(header);

  if (!heic && !isAllowedChatImageType(inferredImageType(file))) {
    throw new Error("Please choose a JPEG, PNG, or WebP photo.");
  }
  if (file.size > CHAT_IMAGE_MAX_IN_BYTES) {
    throw new Error("That photo is too large to process. Please choose a smaller one.");
  }

  const decoded = await decodePhoto(file, heic);
  try {
    const srcW = decoded.width;
    const srcH = decoded.height;
    if (!srcW || !srcH) {
      throw new Error(heic ? HEIC_PROCESS_ERROR : "Could not read that photo.");
    }

    const longEdge = Math.max(srcW, srcH);
    const scale = longEdge > CHAT_IMAGE_MAX_EDGE ? CHAT_IMAGE_MAX_EDGE / longEdge : 1;
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare that photo.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);

    const encoded = await encode(canvas, true);
    if (!encoded) {
      throw new Error("That photo could not be compressed enough to send.");
    }
    return {
      blob: encoded.blob,
      width,
      height,
      ext: encoded.ext,
      mime: encoded.mime,
    };
  } finally {
    decoded.close?.();
  }
}
