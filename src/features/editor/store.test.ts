import { afterEach, expect, test, vi } from 'vitest';
import type { FeedResponse } from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';
import { createEditorStore } from './store';

const response = (): FeedResponse =>
  structuredClone({
    feed: fixture.feed,
    context: fixture.context,
  }) as FeedResponse;
const output = () => structuredClone(fixture.all_omitted);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function ready() {
  const store = createEditorStore();
  await store.getState().loadFeed(async () => response());
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ output: output() })),
  );
  await store.getState().generate();
  return store;
}

test('new submission, cancellation and reset ignore late success and failure', async () => {
  const store = createEditorStore();
  const old = Promise.withResolvers<FeedResponse>();
  let signal: AbortSignal | undefined;
  const pending = store.getState().loadFeed((s) => {
    signal = s;
    return old.promise;
  });
  await store.getState().loadFeed(async () => {
    const value = response();
    value.feed.feed_id = 'new';
    return value;
  });
  expect(signal?.aborted).toBe(true);
  old.resolve(response());
  await pending;
  expect(store.getState().original?.feed.feed_id).toBe('new');
  const late = Promise.withResolvers<FeedResponse>();
  const work = store.getState().loadFeed(() => late.promise);
  store.getState().reset();
  late.reject(new Error('old failure'));
  await work;
  expect(store.getState()).toMatchObject({
    draft: null,
    original: null,
    request: { status: 'idle' },
  });
  const last = Promise.withResolvers<FeedResponse>();
  const cancelled = store.getState().loadFeed(() => last.promise);
  store.getState().cancel();
  last.resolve(response());
  await cancelled;
  expect(store.getState().original).toBeNull();
});

test('sessions are independent and deletion, replacement, reset release only removed object URLs', () => {
  const create = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation(() => `blob:${crypto.randomUUID()}`);
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const store = createEditorStore();
  const other = createEditorStore();
  const first = new File(['a'], 'first.jpg');
  const second = new File(['b'], 'second.jpg');
  const replacement = new File(['c'], 'other.jpg');
  store.getState().selectFiles([first, second]);
  const [a, b] = store.getState().photos;
  store.getState().selectFiles([second]);
  expect(store.getState().photos[0]).toBe(b);
  expect(revoke).toHaveBeenCalledWith(a.url);
  store.getState().selectFiles([replacement]);
  expect(revoke).toHaveBeenCalledWith(b.url);
  expect(store.getState().photos[0].photo_id).not.toBe(b.photo_id);
  store.getState().reset();
  expect(create).toHaveBeenCalledTimes(3);
  expect(revoke).toHaveBeenCalledTimes(3);
  expect(other.getState().photos).toEqual([]);
});

test('reorder and direct edits preserve source evidence and export the same photo set', async () => {
  const store = await ready();
  const original = structuredClone(store.getState().original);
  store.getState().movePhoto('ph_01', 2);
  store.getState().editCaption('ph_01', '내 문장');
  let draft = store.getState().exportDraft();
  expect(draft.slots[2]).toMatchObject({
    photo_id: 'ph_01',
    position: 3,
    caption_state: 'user',
    text: '내 문장',
  });
  expect(draft.slots[2].evidence.some((e) => e.kind === 'uploaded_photo')).toBe(
    true,
  );
  expect(store.getState().original).toEqual(original);
  store.getState().editCaption('ph_01', '');
  draft = store.getState().exportDraft();
  expect(draft.slots.every((s) => s.caption_state === 'omitted')).toBe(true);
  draft.title = 'outside mutation';
  expect(store.getState().draft?.title).not.toBe(draft.title);
});

test('single-slot fill follows reordered photo IDs and preserves edits made while pending', async () => {
  const store = await ready();
  const filled = {
    ...fixture.output.slots[0],
    caption_state: 'filled',
    omit_reason: null,
    text: '단색 카드',
  };
  let deferred = Promise.withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => deferred.promise),
  );
  let pending = store.getState().generate('ph_01');
  store.getState().movePhoto('ph_01', 2);
  deferred.resolve(Response.json({ slot: filled }));
  await pending;
  expect(store.getState().draft?.slots[2]).toMatchObject({
    photo_id: 'ph_01',
    position: 3,
    text: '단색 카드',
  });
  deferred = Promise.withResolvers<Response>();
  pending = store.getState().generate('ph_01');
  store.getState().editCaption('ph_01', '기다리는 동안 내가 수정');
  deferred.resolve(Response.json({ slot: filled }));
  await pending;
  expect(store.getState().draft?.slots[2].text).toBe('기다리는 동안 내가 수정');
});

test('whole generation preserves user captions, deliberate omissions and title edits', async () => {
  const store = await ready();
  store.getState().editTitle('내 제목');
  store.getState().editCaption('ph_01', '미리 수정');
  store.getState().editCaption('ph_02', '');
  const deferred = Promise.withResolvers<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => deferred.promise),
  );
  const pending = store.getState().generate();
  store.getState().editCaption('ph_03', '응답 중 수정');
  deferred.resolve(Response.json({ output: output() }));
  await pending;
  expect(store.getState().draft?.title).toBe('내 제목');
  expect(store.getState().draft?.slots.map((s) => s.text)).toEqual([
    '미리 수정',
    null,
    '응답 중 수정',
  ]);
  expect(store.getState().draft?.slots[1].omit_reason).toBe(
    '직접 비워 두었어요.',
  );
  expect(store.getState().originalOutput).toEqual(output());
});

test('invalid feed and failed generation end loading, preserve draft and allow retry', async () => {
  const store = await ready();
  const before = structuredClone(store.getState().draft);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('bad', { status: 502 })),
  );
  await store.getState().generate();
  expect(store.getState().request.status).toBe('error');
  expect(store.getState().draft).toEqual(before);
  await store.getState().loadFeed(async () => {
    const value = response();
    value.feed.slots.pop();
    return value;
  });
  expect(store.getState().request.status).toBe('error');
  expect(store.getState().draft).toEqual(before);
  await store.getState().loadFeed(async () => response());
  expect(store.getState().request.status).toBe('ready');
});
