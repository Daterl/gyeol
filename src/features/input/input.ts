import {
  MAX_UPLOAD_BYTES,
  UPLOAD_MEDIA_TYPES,
  validateIdentity,
} from '../../../lib/interaction.js';
import {
  ApiError,
  analyzePhoto,
  curatePhotos,
  orderPhotos,
} from '../../lib/api';
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
export const MAX_SELECTED_PHOTOS = 15;
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
    else if (!files.includes(file)) files.push(file);
  }
  if (files.length > MAX_SELECTED_PHOTOS)
    return {
      errors: [
        ...errors,
        `사진은 최대 ${MAX_SELECTED_PHOTOS}장까지 추가할 수 있어요. 초과한 선택은 추가하지 않았어요.`,
      ],
      files: existing,
    };
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
// 동시 실행 상한. 15장을 한꺼번에 던지면 429 를 맞고, 1개(순차)면 15장에 155초가 걸린다.
// 값의 실측 근거는 docs/specs/126-parallel-analysis/report.md.
const ANALYZE_CONCURRENCY = 8;
// 첫 시도 + 재시도 1회. 재시도 한 번이 최악 20초를 더하므로 그 이상 늘리면 30초 목표를 스스로 깬다.
const ANALYZE_ATTEMPTS = 2;
const ANALYZE_RETRY_MS = 400;
// 인증 문제는 다시 물어도 같은 답이 온다. lib/model.js 가 429·5xx 만 재시도하는 규칙과 같은 자리.
const NEVER_RETRY = new Set(['MODEL_KEY_MISSING', 'CANCELLED']);
const retryable = (error: unknown) =>
  error instanceof ApiError &&
  error.retryable &&
  error.status !== 401 &&
  error.status !== 403 &&
  !NEVER_RETRY.has(error.code);

async function analyzeOnce(
  photo: SelectedPhoto,
  index: number,
  sessionId: string,
  collection: UploadRequest['collection'],
  signal: AbortSignal,
  mock: boolean,
) {
  const bytes = new Uint8Array(await photo.file.arrayBuffer());
  let binary = '';
  for (let start = 0; start < bytes.length; start += 8192)
    binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  const request: UploadRequest = {
    collection,
    file_ref: photo.file.name,
    image_base64: btoa(binary),
    input_index: index,
    media_type: photo.file.type as UploadRequest['media_type'],
    photo_id: photo.photo_id,
    schema_version: '1.0',
    session_id: sessionId,
  };
  for (let attempt = 1; ; attempt++) {
    signal.throwIfAborted();
    try {
      return await analyzePhoto(request, signal, mock);
    } catch (error) {
      if (attempt >= ANALYZE_ATTEMPTS || !retryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, ANALYZE_RETRY_MS));
    }
  }
}

// 사진 한 장당 요청 한 번은 그대로다. 겹치는 정도만 상한을 둔다.
// 한 장이 끝내 실패해도 나머지는 살리고, input_index 는 lib/interaction.js 가 요구하는 0..n-1 로 다시 매긴다.
async function upload(
  photos: SelectedPhoto[],
  sessionId: string,
  collection: UploadRequest['collection'],
  signal: AbortSignal,
  mock: boolean,
) {
  signal.throwIfAborted();
  const done: (PhotoAnalysis | null)[] = new Array(photos.length).fill(null);
  const failed: ({ fileName: string; photoId: string } | null)[] = new Array(
    photos.length,
  ).fill(null);
  let cursor = 0;
  let cancelled: unknown = null;
  const worker = async () => {
    while (cursor < photos.length && !signal.aborted && !cancelled) {
      const index = cursor++;
      try {
        done[index] = await analyzeOnce(
          photos[index],
          index,
          sessionId,
          collection,
          signal,
          mock,
        );
      } catch (error) {
        // 취소는 전체를 멈춘다. 그 밖의 실패는 이 사진 한 장만 버린다.
        if (
          signal.aborted ||
          (error instanceof ApiError && error.code === 'CANCELLED')
        )
          cancelled ??= error;
        else
          failed[index] = {
            fileName: photos[index].file.name,
            photoId: photos[index].photo_id,
          };
      }
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(ANALYZE_CONCURRENCY, photos.length) },
      worker,
    ),
  );
  if (cancelled) throw cancelled;
  signal.throwIfAborted();
  const analyses = done
    .filter((analysis): analysis is PhotoAnalysis => analysis !== null)
    .map((analysis, input_index) => ({ ...analysis, input_index }));
  return { analyses, failed: failed.filter((name) => name !== null) };
}
export async function submitPhotos(
  photos: SelectedPhoto[],
  oldPhotos: SelectedPhoto[],
  fields: IdentityFields,
  signal: AbortSignal,
  mock = false,
) {
  if (photos.length < 3 || photos.length > MAX_SELECTED_PHOTOS)
    throw new ApiError('INVALID_SELECTION', '올릴 사진을 3~15장 골라 주세요.');
  if (oldPhotos.length > MAX_SELECTED_PHOTOS)
    throw new ApiError(
      'INVALID_SELECTION',
      '기존 게시물 사진은 15장까지 골라 주세요.',
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
  if (selected.failed.length)
    throw new ApiError(
      'ANALYSIS_FAILED',
      `사진 ${selected.failed.length}장을 읽지 못했어요(${selected.failed.map(({ fileName, photoId }) => `${fileName} · ${photoId}`).join(', ')}). 다시 시도하거나 해당 사진을 제외해 주세요.`,
    );
  // 3장 미만이면 /api/feed 가 받지 않는다. 빈 자리를 지어내지 않고 무엇이 빠졌는지 말한다.
  if (selected.analyses.length < 3)
    throw new ApiError(
      'ANALYSIS_FAILED',
      `사진 ${selected.failed.length}장을 읽지 못했어요. 남은 사진이 3장보다 적어요.`,
    );
  const previous = await upload(oldPhotos, sessionId, 'current', signal, mock);
  if (oldPhotos.length && !previous.analyses.length)
    throw new ApiError(
      'ANALYSIS_FAILED',
      `기존 게시물 사진을 읽지 못했어요(${previous.failed.map(({ fileName }) => fileName).join(', ')}). 사진을 비우거나 다시 시도해 주세요.`,
    );
  return orderPhotos(
    {
      schema_version: '1.0',
      session_id: sessionId,
      photos: selected.analyses,
      identity: identityInput(fields, previous.analyses),
    },
    signal,
  );
}

export async function submitCuration(
  photos: SelectedPhoto[],
  profile: { url: string; snapshotId: string; expires_at: number },
  prompt: string,
  signal: AbortSignal,
  mock = false,
) {
  if (!profile.snapshotId || profile.expires_at <= Date.now())
    throw new ApiError(
      'PROFILE_SNAPSHOT_EXPIRED',
      '프로필 연결이 만료됐어요. 공개 프로필을 다시 연결해 주세요.',
    );
  if (photos.length < 3 || photos.length > MAX_SELECTED_PHOTOS)
    throw new ApiError('INVALID_SELECTION', '올릴 사진을 3~15장 골라 주세요.');
  if (prompt.length > 2000)
    throw new ApiError(
      'INVALID_REQUEST',
      '원하는 느낌은 2000자 이내로 적어 주세요.',
    );
  const sessionId = crypto.randomUUID();
  const selected = await upload(photos, sessionId, 'selected', signal, mock);
  if (selected.failed.length)
    throw new ApiError(
      'ANALYSIS_FAILED',
      `사진 ${selected.failed.length}장을 읽지 못했어요(${selected.failed.map(({ fileName, photoId }) => `${fileName} · ${photoId}`).join(', ')}). 다시 시도하거나 해당 사진을 제외해 주세요.`,
    );
  return curatePhotos(
    {
      schema_version: '1.0',
      session_id: sessionId,
      photos: selected.analyses,
      profile_url: profile.url,
      profile_snapshot_id: profile.snapshotId,
      prompt: prompt.trim(),
    },
    signal,
  );
}
