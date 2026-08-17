const HEIC_PROCESS_ERROR =
  "This photo couldn’t be processed. Please try another photo.";

export type DecodedChatImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

function orientedBitmapOptions(): ImageBitmapOptions {
  return { imageOrientation: "from-image" };
}

export async function convertHeicToDecoded(
  file: Blob,
): Promise<DecodedChatImage> {
  try {
    const { heicTo } = await import("heic-to");

    try {
      const bmp = await heicTo({
        blob: file,
        type: "bitmap",
        options: orientedBitmapOptions(),
      });
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
      // Some HEIC files decode more reliably as a JPEG still.
    }

    const jpeg = await heicTo({
      blob: file,
      type: "image/jpeg",
      quality: 0.92,
    });
    if (!(jpeg instanceof Blob) || jpeg.size === 0) {
      throw new Error(HEIC_PROCESS_ERROR);
    }

    const bmp = await createImageBitmap(jpeg, orientedBitmapOptions());
    if (!bmp.width || !bmp.height) {
      bmp.close();
      throw new Error(HEIC_PROCESS_ERROR);
    }
    return {
      source: bmp,
      width: bmp.width,
      height: bmp.height,
      close: () => bmp.close(),
    };
  } catch (error) {
    if (error instanceof Error && error.message === HEIC_PROCESS_ERROR) {
      throw error;
    }
    throw new Error(HEIC_PROCESS_ERROR);
  }
}
