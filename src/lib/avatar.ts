const OUTPUT_SIZE = 256;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Rogne une image carrée et la compresse en JPEG 256×256. */
export function cropAvatarToDataUrl(
  image: HTMLImageElement,
  viewportSize: number,
  baseScale: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): string {
  const scale = baseScale * zoom;
  const displayW = image.naturalWidth * scale;
  const displayH = image.naturalHeight * scale;
  const imgLeft = viewportSize / 2 - displayW / 2 + offsetX;
  const imgTop = viewportSize / 2 - displayH / 2 + offsetY;

  let sx = (0 - imgLeft) / scale;
  let sy = (0 - imgTop) / scale;
  let side = viewportSize / scale;

  if (side > image.naturalWidth) side = image.naturalWidth;
  if (side > image.naturalHeight) side = image.naturalHeight;

  sx = clamp(sx, 0, Math.max(0, image.naturalWidth - side));
  sy = clamp(sy, 0, Math.max(0, image.naturalHeight - side));

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Impossible de lire cette image.');
  ctx.drawImage(image, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return canvas.toDataURL('image/jpeg', 0.86);
}

export function coverScaleForViewport(image: HTMLImageElement, viewportSize: number): number {
  return Math.max(viewportSize / image.naturalWidth, viewportSize / image.naturalHeight);
}

/** Recadre au centre et compresse (fallback sans UI de rognage). */
export function resizeAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choisissez une image.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        const viewport = 280;
        const baseScale = coverScaleForViewport(img, viewport);
        resolve(cropAvatarToDataUrl(img, viewport, baseScale, 1, 0, 0));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Image illisible.'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible.'));
    };
    img.src = url;
  });
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Choisissez une image.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible.'));
    };
    img.src = url;
  });
}
