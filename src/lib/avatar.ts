/** Recadre et compresse une photo de profil en JPEG 256×256. */
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
      const size = 256;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Impossible de lire cette image.'));
        return;
      }
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible.'));
    };
    img.src = url;
  });
}
