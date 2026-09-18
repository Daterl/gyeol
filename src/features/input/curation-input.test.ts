import { afterEach, expect, test, vi } from 'vitest';
import * as api from '@/lib/api';
import { curationFixture } from '../editor/curation-test-fixture';
import { submitCuration } from './input';

const profile = () => ({
  url: 'https://www.instagram.com/public_example/',
  snapshotId: 'public-reference',
  expires_at: Date.now() + 60000,
});
const photos = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    photo_id: `photo-${index}`,
    file: new File(['normalized'], `photo-${index}.webp`, {
      type: 'image/webp',
    }),
    url: `blob:${index}`,
  }));
afterEach(() => vi.restoreAllMocks());
test('new curation accepts 3/15 and optional prompt, rejects 2/16 before network', async () => {
  const analyze = vi
    .spyOn(api, 'analyzePhoto')
    .mockImplementation(async (request) => ({
      ...curationFixture().context.photos[0],
      photo_id: request.photo_id,
      input_index: request.input_index,
      file_ref: request.file_ref,
    }));
  const curate = vi
    .spyOn(api, 'curatePhotos')
    .mockResolvedValue(curationFixture());
  for (const count of [2, 16])
    await expect(
      submitCuration(
        photos(count),
        profile(),
        '',
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_SELECTION' });
  expect(analyze).not.toHaveBeenCalled();
  for (const [count, prompt] of [
    [3, ''],
    [15, '  짧고 담백하게  '],
  ] as const) {
    await submitCuration(
      photos(count),
      profile(),
      prompt,
      new AbortController().signal,
    );
    expect(curate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        profile_snapshot_id: 'public-reference',
        prompt: prompt.trim(),
        photos: expect.any(Array),
      }),
      expect.any(AbortSignal),
    );
    expect(curate.mock.calls.at(-1)?.[0].photos).toHaveLength(count);
  }
  expect(analyze).toHaveBeenCalledTimes(18);
});
test('expired profile, cancellation and failed photo never proceed silently to curation', async () => {
  const analyze = vi
    .spyOn(api, 'analyzePhoto')
    .mockRejectedValue(new api.ApiError('ANALYSIS_FAILED', 'bad photo'));
  const curate = vi
    .spyOn(api, 'curatePhotos')
    .mockResolvedValue(curationFixture());
  await expect(
    submitCuration(
      photos(3),
      { ...profile(), expires_at: 0 },
      '',
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'PROFILE_SNAPSHOT_EXPIRED' });
  expect(analyze).not.toHaveBeenCalled();
  const abort = new AbortController();
  abort.abort();
  await expect(
    submitCuration(photos(3), profile(), '', abort.signal),
  ).rejects.toThrow();
  expect(analyze).not.toHaveBeenCalled();
  await expect(
    submitCuration(photos(3), profile(), '', new AbortController().signal),
  ).rejects.toMatchObject({
    code: 'ANALYSIS_FAILED',
    message: expect.stringContaining('photo-0.webp · photo-0'),
  });
  expect(curate).not.toHaveBeenCalled();
});
