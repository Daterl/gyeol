import { afterEach, expect, test, vi } from 'vitest';
import fixture from '../../../fixtures/interaction.sample.json';
import { buildFeed } from '../../../lib/pipeline.js';
import type { SelectedPhoto } from '../editor/store';
import { addFiles, identityInput, submitPhotos } from './input';

const fields = { currentUrl: '', targetText: '', targetUrl: '' };
const jpeg = (name: string) =>
  new File(['JPEG test bytes'], name, { type: 'image/jpeg' });
const selected = (): SelectedPhoto[] =>
  fixture.context.photos.map((p) => ({
    file: jpeg(p.file_ref),
    photo_id: p.photo_id,
    url: 'blob:local',
  }));
afterEach(() => vi.unstubAllGlobals());

test('selection preserves existing files and explains unsupported, empty, oversized and 21st files', () => {
  const existing = [jpeg('keep.jpg')];
  const result = addFiles(existing, [
    new File(['svg'], 'bad.svg', { type: 'image/svg+xml' }),
    new File([], 'empty.jpg', { type: 'image/jpeg' }),
    new File([new Uint8Array(3_000_001)], 'large.jpg', { type: 'image/jpeg' }),
  ]);
  expect(result.files).toEqual(existing);
  expect(result.errors).toHaveLength(3);
  const many = addFiles(
    [],
    Array.from({ length: 21 }, (_, i) => jpeg(`${i}.jpg`)),
  );
  expect(many.files).toHaveLength(20);
  expect(many.errors[0]).toContain('20장');
});
test('blank identity is valid and mutually exclusive or unsupported URLs fail before upload', async () => {
  expect(identityInput(fields, [])).toEqual({
    current: { kind: 'none' },
    target: { kind: 'none' },
  });
  expect(() =>
    identityInput(
      {
        ...fields,
        targetUrl: 'https://www.instagram.com/29cm/',
        targetText: '짧게',
      },
      [],
    ),
  ).toThrow('하나');
  expect(() =>
    identityInput({ ...fields, currentUrl: 'javascript:alert(1)' }, []),
  ).toThrow('URL');
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(
    submitPhotos(
      selected().slice(0, 2),
      [],
      fields,
      new AbortController().signal,
      true,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  await expect(
    submitPhotos(
      selected(),
      [],
      { ...fields, targetUrl: 'invalid' },
      new AbortController().signal,
      true,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_IDENTITY' });
  await expect(
    submitPhotos(
      selected(),
      Array.from({ length: 21 }, () => selected()[0]),
      fields,
      new AbortController().signal,
      true,
    ),
  ).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  expect(fetcher).not.toHaveBeenCalled();
});
test('upload-to-feed keeps selected IDs, sends each file once and uses the no-model path', async () => {
  const seen: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      seen.push(url);
      const body = JSON.parse(String(options.body));
      if (url.startsWith('/api/analyze')) {
        const photo = fixture.context.photos.find(
          (p) => p.photo_id === body.photo_id,
        );
        expect(photo).toBeDefined();
        expect(body.file_ref).toBe(photo?.file_ref);
        expect(atob(body.image_base64)).toBe('JPEG test bytes');
        expect(body.collection).toBe('selected');
        expect(typeof body.session_id).toBe('string');
        return Response.json(photo);
      }
      expect(body.photos.map((p: { photo_id: string }) => p.photo_id)).toEqual(
        selected().map((p) => p.photo_id),
      );
      return Response.json({
        ...fixture.photo_only,
        feed: { ...fixture.photo_only.feed, session_id: body.session_id },
      });
    }),
  );
  const result = await submitPhotos(
    selected(),
    [],
    fields,
    new AbortController().signal,
    true,
  );
  expect(result.feed.slots).toHaveLength(3);
  expect(seen).toEqual([
    '/api/analyze?mock=1',
    '/api/analyze?mock=1',
    '/api/analyze?mock=1',
    '/api/feed',
  ]);
});
test('photo analysis runs four at a time and preserves selection order', async () => {
  const photos = Array.from({ length: 8 }, (_, index) => ({
    file: jpeg(`${index}.jpg`),
    photo_id: `parallel_${index}`,
    url: 'blob:local',
  }));
  let active = 0;
  let maxActive = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (url.startsWith('/api/analyze')) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 0));
        active -= 1;
        return Response.json({
          ...structuredClone(fixture.context.photos[0]),
          file_ref: body.file_ref,
          input_index: body.input_index,
          photo_id: body.photo_id,
        });
      }
      return Response.json(await buildFeed(body));
    }),
  );
  const result = await submitPhotos(
    photos,
    [],
    fields,
    new AbortController().signal,
    true,
  );
  // 상한값은 #126 실측으로 8 로 정했다(4 는 15장에 약 40초). docs/specs/126-parallel-analysis/report.md
  expect(maxActive).toBe(8);
  expect(result.context.photos.map((photo) => photo.photo_id)).toEqual(
    photos.map((photo) => photo.photo_id),
  );
});
test('cancellation before upload sends no file', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const controller = new AbortController();
  controller.abort();
  await expect(
    submitPhotos(selected(), [], fields, controller.signal, true),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

// --- #126 병렬 분석 ---
const many = (count: number): SelectedPhoto[] =>
  Array.from({ length: count }, (_, i) => ({
    file: jpeg(`p${i}.jpg`),
    photo_id: `ph_${i}`,
    url: 'blob:local',
  }));
// 응답은 요청 사진의 신원을 그대로 돌려준다. analyzePhoto 가 그것을 검사한다.
const analysisFor = (body: {
  photo_id: string;
  file_ref: string;
  input_index: number;
}) => ({ ...fixture.context.photos[0], ...body });
// 실제 /api/feed 파이프라인을 그대로 부른다 — 재색인한 photos 를 서버가 정말 받는지가 이 이슈의 DoD 다.
const feedFor = async (body: unknown) => {
  const { buildFeed } = await import('../../../lib/pipeline.js');
  return Response.json(await buildFeed(body));
};
const errorBody = (code: string, retryable: boolean) =>
  Response.json(
    { error: { code, message: '실패', retryable } },
    { status: 502 },
  );

test('분석은 동시 실행 수 상한을 지키고, 상한보다 많은 사진도 전부 처리한다', async () => {
  let inFlight = 0;
  let peak = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (!url.startsWith('/api/analyze')) return feedFor(body);
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return Response.json(analysisFor(body));
    }),
  );
  const result = await submitPhotos(
    many(20),
    [],
    fields,
    new AbortController().signal,
    true,
  );
  expect(result.feed.slots).toHaveLength(20);
  expect(peak).toBeGreaterThan(1); // 순차가 아니다
  expect(peak).toBeLessThanOrEqual(8); // 상한을 넘지 않는다
});

test('한 장이 실패해도 나머지는 살고 input_index 를 0..n-1 로 다시 매긴다', async () => {
  let sent: { photo_id: string; input_index: number }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (!url.startsWith('/api/analyze')) {
        sent = body.photos;
        return feedFor(body);
      }
      // 사진 한 장만 사진 자체의 문제로 실패한다(재시도해도 같다).
      if (body.photo_id === 'ph_5') return errorBody('INVALID_IMAGE', false);
      return Response.json(analysisFor(body));
    }),
  );
  const result = await submitPhotos(
    many(15),
    [],
    fields,
    new AbortController().signal,
    true,
  );
  expect(result.feed.slots).toHaveLength(14);
  expect(sent.map((photo) => photo.input_index)).toEqual([...Array(14).keys()]);
  expect(sent.some((photo) => photo.photo_id === 'ph_5')).toBe(false);
});

test('남은 사진이 3장보다 적으면 빈 자리를 지어내지 않고 실패를 알린다', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (!url.startsWith('/api/analyze')) return feedFor(body);
      return body.photo_id === 'ph_0'
        ? Response.json(analysisFor(body))
        : errorBody('INVALID_IMAGE', false);
    }),
  );
  await expect(
    submitPhotos(many(3), [], fields, new AbortController().signal, true),
  ).rejects.toMatchObject({ code: 'ANALYSIS_FAILED' });
});

test('429·타임아웃은 다시 시도하고 인증 오류는 다시 시도하지 않는다', async () => {
  const attempts: Record<string, number> = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      if (!url.startsWith('/api/analyze')) return feedFor(body);
      attempts[body.photo_id] = (attempts[body.photo_id] ?? 0) + 1;
      // ph_0: 첫 시도만 429 — 두 번째에 성공해야 한다.
      if (body.photo_id === 'ph_0' && attempts.ph_0 === 1)
        return errorBody('MODEL_HTTP', true);
      // ph_1: 인증 오류 — 재시도하지 않고 바로 버린다.
      if (body.photo_id === 'ph_1') return errorBody('MODEL_KEY_MISSING', true);
      return Response.json(analysisFor(body));
    }),
  );
  const result = await submitPhotos(
    many(4),
    [],
    fields,
    new AbortController().signal,
    true,
  );
  expect(attempts.ph_0).toBe(2);
  expect(attempts.ph_1).toBe(1);
  expect(result.feed.slots).toHaveLength(3);
});
