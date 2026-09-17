import { afterEach, expect, test, vi } from 'vitest';
import fixture from '../../../fixtures/interaction.sample.json';
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
