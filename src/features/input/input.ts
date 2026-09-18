import {
  MAX_UPLOAD_BYTES,
  UPLOAD_MEDIA_TYPES,
  validateIdentity,
} from '../../../lib/interaction.js';
import { ApiError, analyzePhoto, orderPhotos } from '../../lib/api';
import type {
  Identity,
  PhotoAnalysis,
  UploadRequest,
} from '../../types/contracts';
import type { SelectedPhoto } from '../editor/store';

export type IdentityFields = {
  currentUrl: string;
  targetText: string;
  targetUrl: string;
};
export function addFiles(existing: File[], incoming: File[]) {
  const files = [...existing];
  const errors: string[] = [];
  for (const file of incoming) {
    if (!UPLOAD_MEDIA_TYPES.includes(file.type))
      errors.push(`${file.name}: JPEG, PNG, WebP 사진을 골라 주세요.`);
    else if (!file.size || file.size > MAX_UPLOAD_BYTES)
      errors.push(`${file.name}: 한 장에 3MB까지 가능해요.`);
    else if (file.name.length > 512)
      errors.push('파일 이름이 너무 길어요. 이름을 줄여 주세요.');
    else if (files.length === 20) {
      errors.push('사진은 최대 20장까지 추가할 수 있어요.');
      break;
    } else if (!files.includes(file)) files.push(file);
  }
  return { errors, files };
}
export function identityInput(
  fields: IdentityFields,
  oldPhotos: PhotoAnalysis[],
): Identity {
  const { currentUrl, targetText, targetUrl } = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, value.trim()]),
  ) as IdentityFields;
  if (currentUrl && oldPhotos.length)
    throw new ApiError(
      'INVALID_IDENTITY',
      '내 인스타 URL과 기존 게시물 사진 중 하나를 골라 주세요.',
    );
  if (targetUrl && targetText)
    throw new ApiError(
      'INVALID_IDENTITY',
      '레퍼런스 URL과 원하는 느낌 중 하나를 골라 주세요.',
    );
  const identity: Identity = {
    current: currentUrl
      ? { kind: 'reference', url: currentUrl }
      : oldPhotos.length
        ? { kind: 'posts', photos: oldPhotos }
        : { kind: 'none' },
    target: targetUrl
      ? { kind: 'reference', url: targetUrl }
      : targetText
        ? { kind: 'text', text: targetText }
        : { kind: 'none' },
  };
  try {
    validateIdentity(identity);
  } catch {
    throw new ApiError(
      'INVALID_IDENTITY',
      '인스타 계정 URL이나 원하는 느낌을 확인해 주세요.',
    );
  }
  return identity;
}
async function upload(
  photos: SelectedPhoto[],
  sessionId: string,
  collection: UploadRequest['collection'],
  signal: AbortSignal,
  mock: boolean,
) {
  const analyses = Array<PhotoAnalysis>(photos.length);
  let next = 0;
  const failed = new AbortController();
  const sharedSignal = AbortSignal.any([signal, failed.signal]);
  const worker = async () => {
    while (next < photos.length) {
      const index = next++;
      const photo = photos[index];
      sharedSignal.throwIfAborted();
      const bytes = new Uint8Array(await photo.file.arrayBuffer());
      let binary = '';
      for (let start = 0; start < bytes.length; start += 8192)
        binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
      sharedSignal.throwIfAborted();
      analyses[index] = await analyzePhoto(
        {
          collection,
          file_ref: photo.file.name,
          image_base64: btoa(binary),
          input_index: index,
          media_type: photo.file.type as UploadRequest['media_type'],
          photo_id: photo.photo_id,
          schema_version: '1.0',
          session_id: sessionId,
        },
        sharedSignal,
        mock,
      );
    }
  };
  try {
    // Four 3MB requests cap in-flight source data near 12MB and put the measured 15-photo path under one minute.
    await Promise.all(
      Array.from({ length: Math.min(4, photos.length) }, worker),
    );
  } catch (error) {
    failed.abort(error);
    throw error;
  }
  return analyses;
}
export async function submitPhotos(
  photos: SelectedPhoto[],
  oldPhotos: SelectedPhoto[],
  fields: IdentityFields,
  signal: AbortSignal,
  mock = false,
) {
  if (photos.length < 3 || photos.length > 20)
    throw new ApiError('INVALID_SELECTION', '올릴 사진을 3~20장 골라 주세요.');
  if (oldPhotos.length > 20)
    throw new ApiError(
      'INVALID_SELECTION',
      '기존 게시물 사진은 20장까지 골라 주세요.',
    );
  // Validate identity conflicts before any file leaves the browser; full posts identity is checked after analysis.
  if (fields.currentUrl.trim() && oldPhotos.length)
    throw new ApiError(
      'INVALID_IDENTITY',
      '내 인스타 URL과 기존 게시물 사진 중 하나를 골라 주세요.',
    );
  identityInput(fields, []);
  const sessionId = crypto.randomUUID();
  const selected = await upload(photos, sessionId, 'selected', signal, mock);
  const previous = await upload(oldPhotos, sessionId, 'current', signal, mock);
  return orderPhotos(
    {
      schema_version: '1.0',
      session_id: sessionId,
      photos: selected,
      identity: identityInput(fields, previous),
    },
    signal,
  );
}
