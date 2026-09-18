import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import type { F3Export, FeedResponse } from '@/types/contracts';
import sample from '../../../fixtures/sample_result.json';
import {
  validateFeedResponse,
  validateGenerateResponse,
} from '../../../lib/interaction.js';
import { previewOutput } from '../captions/preview-output';
import { createEditorStore } from '../editor/store';

afterEach(() => vi.unstubAllGlobals());
test('sample photos, observations and output match and local replay makes no network call', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  validateFeedResponse(sample.response);
  validateGenerateResponse(
    { output: sample.output },
    { ...sample.response, schema_version: '1.0', mode: 'all' },
  );
  expect(sample.provenance.synthetic).toBe(true);
  expect(
    sample.output.slots.some((slot) => slot.caption_state === 'omitted'),
  ).toBe(true);
  for (const photo of sample.response.context.photos) {
    const image = sample.images[photo.photo_id as keyof typeof sample.images];
    expect(image.src).toBe(`/samples/${photo.file_ref}`);
    const bytes = readFileSync(
      new URL(`../../../public${image.src}`, import.meta.url),
    );
    expect([...bytes.subarray(0, 8)]).toEqual([
      137, 80, 78, 71, 13, 10, 26, 10,
    ]);
    expect(photo.model).toContain('manual sample annotation');
  }
  const store = createEditorStore();
  await store
    .getState()
    .loadFeed(async () => structuredClone(sample.response) as FeedResponse);
  await store.getState().generate(undefined, async () => ({
    output: structuredClone(sample.output) as F3Export,
  }));
  expect(store.getState().request.status).toBe('ready');
  expect(store.getState().exportDraft().title).toBe('빛이 머문 자리');
  const omitted = store
    .getState()
    .draft?.slots.find((slot) => slot.caption_state === 'omitted');
  await store.getState().generate(omitted?.photo_id, previewOutput);
  expect(
    store
      .getState()
      .draft?.slots.find((slot) => slot.photo_id === omitted?.photo_id)
      ?.caption_state,
  ).toBe('seed');
  expect(fetcher).not.toHaveBeenCalled();
});
