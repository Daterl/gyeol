import {
  MAX_UPLOAD_BYTES,
  UPLOAD_MEDIA_TYPES,
} from '../../../lib/interaction.js';

const MAX_LONG_EDGE = 1440;
const WEBP_QUALITY = 0.82;

export async function normalizePhoto(file: File): Promise<File> {
  if (!UPLOAD_MEDIA_TYPES.includes(file.type) || !file.size)
    throw new Error('JPEG, PNG, WebP 사진을 골라 주세요.');
  if (file.size > MAX_UPLOAD_BYTES)
    throw new Error('한 장에 3MB까지 가능해요.');
  if (file.name.length > 512) throw new Error('파일 이름이 너무 길어요.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('사진을 읽지 못했어요.');
  }
  try {
    if (bitmap.width < 1 || bitmap.height < 1)
      throw new Error('사진의 크기를 확인하지 못했어요.');
    const scale = Math.min(
      1,
      MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('이 브라우저에서 사진을 준비할 수 없어요.');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
    );
    if (
      !blob?.size ||
      blob.size > MAX_UPLOAD_BYTES ||
      blob.type !== 'image/webp'
    )
      throw new Error('사진을 3MB 이하 WebP로 준비하지 못했어요.');
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, {
      lastModified: file.lastModified,
      type: 'image/webp',
    });
  } finally {
    bitmap.close();
  }
}

export async function normalizePhotos(files: File[]) {
  const errors: string[] = [];
  const ready: File[] = [];
  // Mobile browsers cannot safely hold 15 decoded camera images at once.
  for (const file of files) {
    try {
      ready.push(await normalizePhoto(file));
    } catch (error) {
      errors.push(
        `${file.name}: ${error instanceof Error ? error.message : '사진을 준비하지 못했어요.'}`,
      );
    }
  }
  return { errors, files: ready };
}
