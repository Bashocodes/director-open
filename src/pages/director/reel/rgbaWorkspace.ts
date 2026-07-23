function mimeTypeForExtension(extension: string) {
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export function canvasPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Director could not encode a structural-effect frame.'));
    }, 'image/png');
  });
}

export async function decodeRgbaWorkspace(options: {
  bytes: Uint8Array;
  extension: string;
  width: number;
  height: number;
}) {
  const sourceBytes = options.bytes.slice().buffer;
  const bitmap = await createImageBitmap(new Blob(
    [sourceBytes],
    { type: mimeTypeForExtension(options.extension) },
  ));
  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error('Director could not create the structural-effect workspace.');
  }
  const scale = Math.max(options.width / bitmap.width, options.height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.drawImage(
    bitmap,
    (options.width - drawWidth) / 2,
    (options.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  const frame = context.getImageData(0, 0, options.width, options.height);
  return { bitmap, canvas, context, frame, source: frame.data.slice() };
}
