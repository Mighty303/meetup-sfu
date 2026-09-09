// Turning a chosen file into something small enough to keep on the user row.
// Browser-only: it needs a canvas.

/** Square, and big enough for a 48px avatar on a 2x screen. */
export const AVATAR_PX = 128;

/** Anything larger is refused before decoding — a 40MP photo would just stall. */
export const MAX_FILE_BYTES = 12 * 1024 * 1024;

/**
 * Centre-crop to a square, downscale, re-encode. WebP where the browser has it,
 * JPEG otherwise; `toDataURL` quietly hands back a PNG when it doesn't know the
 * type, which for a photo would be several times the size, so the result is
 * checked rather than trusted.
 */
export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("that isn't an image");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("that image is too large — 12 MB is the limit");
  }

  const bitmap = await loadBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("your browser wouldn't render the image");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PX,
    AVATAR_PX
  );
  if ("close" in bitmap) bitmap.close();

  const webp = canvas.toDataURL("image/webp", 0.85);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.85);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari refuses some formats here but still decodes them in an <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("that image wouldn't load"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
