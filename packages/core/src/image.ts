import { AppError } from './errors';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function checkImage(file: Blob): void {
  if (!file.type.startsWith('image/')) throw new AppError('INVALID_IMAGE');
  if (file.size > MAX_IMAGE_BYTES) throw new AppError('PAYLOAD_TOO_LARGE');
}

/**
 * Shrinks the photo so the long side is at most `maxSide` px.
 * Fewer pixels means fewer vision tokens, which is the main cost on phones.
 * Falls back to the original image where OffscreenCanvas isn't available.
 */
export async function downscale(image: Blob, maxSide = 1024, quality = 0.9): Promise<Blob> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') return image;
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && image.type === 'image/jpeg') return image;
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return image;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality });
  } finally {
    bitmap.close();
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
