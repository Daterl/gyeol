import type {
  FeedResponse,
  GenerateRequest,
  GenerateResponse,
  OrderRequest,
  PhotoAnalysis,
  UploadRequest,
} from '@/types/contracts';
import { validatePhoto } from '../../lib/contracts.js';
import {
  REQUEST_TIMEOUT_MS,
  validateErrorResponse,
  validateFeedResponse,
  validateGenerateRequest,
  validateGenerateResponse,
  validateOrderRequest,
} from '../../lib/interaction.js';

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public retryable = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
async function post(
  path: string,
  body: unknown,
  validate: (value: unknown) => void,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new DOMException('Timeout', 'TimeoutError')),
    REQUEST_TIMEOUT_MS,
  );
  const combined = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  try {
    const response = await fetch(path, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal: combined,
    });
    if (response.status === 413)
      throw new ApiError(
        'REQUEST_TOO_LARGE',
        '파일이나 요청이 너무 커요. 크기를 줄여 주세요.',
        413,
      );
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ApiError(
        'INVALID_RESPONSE',
        '응답을 읽지 못했어요. 다시 시도해 주세요.',
        response.status,
        true,
      );
    }
    combined.throwIfAborted();
    if (!response.ok) {
      try {
        validateErrorResponse(data);
      } catch {
        throw new ApiError(
          'INVALID_RESPONSE',
          '서버 오류를 확인하지 못했어요.',
          response.status,
          true,
        );
      }
      const { error } = data as {
        error: { code: string; message: string; retryable: boolean };
      };
      throw new ApiError(
        error.code,
        error.message,
        response.status,
        error.retryable,
      );
    }
    try {
      validate(data);
    } catch {
      throw new ApiError(
        'INVALID_RESPONSE',
        '응답의 사진이나 형식이 요청과 달라요.',
        response.status,
        true,
      );
    }
    return data;
  } catch (error) {
    if (signal?.aborted) throw new ApiError('CANCELLED', '요청을 취소했어요.');
    if (controller.signal.aborted)
      throw new ApiError(
        'TIMEOUT',
        '응답이 늦어지고 있어요. 다시 시도해 주세요.',
        0,
        true,
      );
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      'NETWORK',
      '연결을 확인하고 다시 시도해 주세요.',
      0,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}
export async function analyzePhoto(
  request: UploadRequest,
  signal?: AbortSignal,
): Promise<PhotoAnalysis> {
  return (await post(
    '/api/analyze',
    request,
    (value) => {
      validatePhoto(value);
      const photo = value as PhotoAnalysis;
      if (
        photo.photo_id !== request.photo_id ||
        photo.input_index !== request.input_index ||
        photo.file_ref !== request.file_ref
      )
        throw new Error('Photo identity differs');
    },
    signal,
  )) as PhotoAnalysis;
}
export async function orderPhotos(
  request: OrderRequest,
  signal?: AbortSignal,
): Promise<FeedResponse> {
  validateOrderRequest(request);
  return (await post(
    '/api/feed',
    request,
    (value) => {
      validateFeedResponse(value);
      const result = value as FeedResponse;
      const { current, target } = request.identity;
      if ((target.kind === 'none') !== 'kind' in result.context.target)
        throw new Error('Target identity differs');
      if (
        target.kind === 'text' &&
        (!('raw_freetext' in result.context.target) ||
          result.context.target.raw_freetext !== target.text)
      )
        throw new Error('Target text differs');
      if ((current.kind === 'none') !== !result.context.current.present)
        throw new Error('Current identity differs');
      if (
        current.kind === 'posts' &&
        (result.context.current.source !== 'photo_upload' ||
          result.context.current_photos.length !== current.photos.length ||
          result.context.current_photos.some(
            (photo, index) =>
              photo.photo_id !== current.photos[index]?.photo_id,
          ))
      )
        throw new Error('Current photos differ');
      if (
        result.feed.session_id !== request.session_id ||
        result.context.photos.length !== request.photos.length ||
        result.context.photos.some(
          (photo, index) =>
            photo.photo_id !== request.photos[index]?.photo_id ||
            photo.input_index !== request.photos[index]?.input_index ||
            photo.file_ref !== request.photos[index]?.file_ref,
        )
      )
        throw new Error('Photo input differs');
    },
    signal,
  )) as FeedResponse;
}
export async function generateOutput(
  request: GenerateRequest,
  signal?: AbortSignal,
): Promise<GenerateResponse> {
  validateGenerateRequest(request);
  return (await post(
    '/api/generate',
    request,
    (value) => {
      validateGenerateResponse(value, request);
    },
    signal,
  )) as GenerateResponse;
}
