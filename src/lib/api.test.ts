import { afterEach, expect, test, vi } from 'vitest';
import type {
  FeedResponse,
  OrderRequest,
  UploadRequest,
} from '@/types/contracts';
import fixture from '../../fixtures/interaction.sample.json';
import { REQUEST_TIMEOUT_MS } from '../../lib/interaction.js';
import {
  LATEST_OMIT_RULES,
  OMIT_RULES_HEADER,
} from '../../lib/omit-suggestion.js';
import { analyzePhoto, generateOutput, orderPhotos } from './api';

const response = (): FeedResponse =>
  structuredClone({
    feed: fixture.feed,
    context: fixture.context,
  }) as FeedResponse;
const order = (): OrderRequest => ({
  identity: {
    current: { kind: 'none' },
    target: { kind: 'text', text: fixture.context.target.raw_freetext },
  },
  photos: response().context.photos,
  schema_version: '1.0',
  session_id: fixture.feed.session_id,
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('typed feed and generation requests reject mismatched identities and malformed success', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(response()));
  vi.stubGlobal('fetch', fetcher);
  expect((await orderPhotos(order())).feed.feed_id).toBe(fixture.feed.feed_id);
  const wrong = response();
  wrong.feed.session_id = 'other-session';
  fetcher.mockResolvedValueOnce(Response.json(wrong));
  await expect(orderPhotos(order())).rejects.toMatchObject({
    code: 'INVALID_RESPONSE',
  });
  fetcher.mockResolvedValueOnce(Response.json({ slots: [] }));
  await expect(
    generateOutput({ ...response(), mode: 'all', schema_version: '1.0' }),
  ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  fetcher.mockResolvedValueOnce(Response.json({ output: fixture.all_omitted }));
  expect(
    await generateOutput({ ...response(), mode: 'all', schema_version: '1.0' }),
  ).toEqual({ output: fixture.all_omitted });
});

test('analyze response must preserve photo ID, input index and file reference', async () => {
  const photo = response().context.photos[0];
  const upload: UploadRequest = {
    collection: 'selected',
    file_ref: photo.file_ref,
    image_base64: 'AA==',
    input_index: photo.input_index,
    media_type: 'image/jpeg',
    photo_id: photo.photo_id,
    schema_version: '1.0',
    session_id: 'test-session',
  };
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(photo));
  vi.stubGlobal('fetch', fetcher);
  expect(await analyzePhoto(upload)).toEqual(photo);
  for (const patch of [
    { photo_id: 'other' },
    { input_index: 19 },
    { file_ref: 'other.jpg' },
  ]) {
    fetcher.mockResolvedValueOnce(Response.json({ ...photo, ...patch }));
    await expect(analyzePhoto(upload)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  }
});

test('HTTP, platform HTML 413, JSON, network and server error remain explicit failures', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  for (const [value, code, status] of [
    [
      new Response('<html>too large</html>', { status: 413 }),
      'REQUEST_TOO_LARGE',
      413,
    ],
    [new Response('not json'), 'INVALID_RESPONSE', 200],
    [Response.json({ error: 'bad' }, { status: 502 }), 'INVALID_RESPONSE', 502],
    [
      Response.json(
        {
          error: {
            code: 'GENERATION_UNAVAILABLE',
            message: '아직 사용할 수 없어요.',
            retryable: false,
          },
        },
        { status: 503 },
      ),
      'GENERATION_UNAVAILABLE',
      503,
    ],
  ] as const) {
    fetcher.mockResolvedValueOnce(value);
    await expect(orderPhotos(order())).rejects.toMatchObject({ code, status });
  }
  fetcher.mockRejectedValueOnce(new TypeError('network secret detail'));
  await expect(orderPhotos(order())).rejects.toMatchObject({
    code: 'NETWORK',
    message: '연결을 확인하고 다시 시도해 주세요.',
  });
});

test('timeout and caller cancellation abort the request without automatic retry', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener(
          'abort',
          () => reject(options.signal?.reason),
          { once: true },
        );
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  const timed = expect(orderPhotos(order())).rejects.toMatchObject({
    code: 'TIMEOUT',
  });
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
  await timed;
  const controller = new AbortController();
  const cancelled = expect(
    orderPhotos(order(), controller.signal),
  ).rejects.toMatchObject({ code: 'CANCELLED' });
  controller.abort();
  await cancelled;
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

// 협상의 클라이언트 쪽 절반. 이 번들이 규칙 번호를 알리지 않으면 서버는 배포 이전 번들로 보고
// 유사 권고를 빼고 답한다 — 기능이 조용히 사라지고 아무 검사도 실패하지 않는다.
test('every request declares the omit-rule set this bundle can recompute', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json(response()));
  vi.stubGlobal('fetch', fetcher);
  await orderPhotos(order());
  const sent = new Headers(
    (fetcher.mock.calls[0][1] as RequestInit).headers as HeadersInit,
  );
  expect(sent.get(OMIT_RULES_HEADER)).toBe(String(LATEST_OMIT_RULES));
});
