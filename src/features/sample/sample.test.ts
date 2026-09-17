import { afterEach, expect, it, vi } from 'vitest';
import feed from '../../../fixtures/ordered_feed.sample.json';
import { loadSample } from './sample';

afterEach(() => vi.restoreAllMocks());

it('orders by position without changing IDs or evidence', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    Response.json({ ...feed, slots: feed.slots.toReversed() }),
  );
  const signal = new AbortController().signal;
  expect(await loadSample(signal)).toEqual(feed.slots);
  expect(fetch).toHaveBeenCalledWith('/api/feed?mock=1', {
    cache: 'no-store',
    signal,
  });
});

it.each([
  {},
  { slots: [] },
  { slots: [{ photo_id: 'ph_01', position: 1 }] },
  { slots: [feed.slots[0], feed.slots[0]] },
  { slots: [{ ...feed.slots[0], position: 2 }] },
])('rejects malformed or ambiguous output', async (data) => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(data));
  await expect(loadSample(new AbortController().signal)).rejects.toThrow();
});

it('does not present an HTTP failure as a sample', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(null, { status: 500 }),
  );
  await expect(loadSample(new AbortController().signal)).rejects.toThrow(
    '다시 시도',
  );
});
