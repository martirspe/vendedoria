/** Upload limit enforced by `POST catalog/media` (bytes after decoding). */
export const MAX_UPLOAD_BYTES = 750 * 1024;

export type ResizedImage = { contentType: 'image/jpeg' | 'image/webp'; data: string };

/**
 * Scales a photo down so its longest side is at most `maxSide` and re-encodes it until it
 * fits the upload limit. Returns base64 without the data-URL prefix.
 */
export async function resizeImage(file: File, maxSide = 1600): Promise<ResizedImage> {
  if (!file.type.startsWith('image/')) throw new Error('not-image');
  const bitmap = await createImageBitmap(file);
  try {
    let side = maxSide;
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no-canvas');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.76, 0.66]) {
        const blob = await encode(canvas, quality);
        if (blob.size <= MAX_UPLOAD_BYTES) {
          return {
            contentType: blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg',
            data: await toBase64(blob),
          };
        }
      }
      side = Math.round(side * 0.75);
    }
    throw new Error('too-large');
  } finally {
    bitmap.close();
  }
}

/** WebP when the browser can encode it, JPEG otherwise. */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', quality);
  return webp.type === 'image/webp' ? webp : toBlob(canvas, 'image/jpeg', quality);
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode'))), type, quality),
  );
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
