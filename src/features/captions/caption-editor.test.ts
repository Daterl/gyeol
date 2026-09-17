import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type { FeedResponse, GenerateRequest } from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';
import { createEditorStore, type EditorStore } from '../editor/store';
import { exportText } from '../export/export';
import { CaptionEditor, OutputControls } from './caption-editor';
import { previewOutput } from './preview-output';

vi.mock('zustand', () => ({
  useStore: (
    store: EditorStore,
    selector: (state: ReturnType<EditorStore['getState']>) => unknown,
  ) => selector(store.getState()),
}));
afterEach(() => vi.unstubAllGlobals());
const response = (): FeedResponse =>
  structuredClone({
    feed: fixture.feed,
    context: fixture.context,
  }) as FeedResponse;

test('preview has proposed/omitted/user states, fills only requested slot and exports all omissions in user order', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const store = createEditorStore();
  await store.getState().loadFeed(async () => response());
  await store.getState().generate(undefined, previewOutput);
  expect(store.getState().request.status).toBe('ready');
  const omitted = store
    .getState()
    .draft?.slots.find((slot) => slot.caption_state === 'omitted');
  expect(omitted).toBeDefined();
  const id = omitted?.photo_id ?? '';
  let markup = renderToStaticMarkup(
    createElement(CaptionEditor, { store, id, mock: true }),
  );
  expect(markup).toContain('비움(권장)');
  expect(markup).toContain('그래도 채우기');
  const others = store
    .getState()
    .draft?.slots.filter((slot) => slot.photo_id !== id);
  await store.getState().generate(id, previewOutput);
  expect(
    store.getState().draft?.slots.filter((slot) => slot.photo_id !== id),
  ).toEqual(others);
  expect(
    renderToStaticMarkup(
      createElement(CaptionEditor, { store, id, mock: true }),
    ),
  ).toContain('제안됨');
  store.getState().editCaption(id, '내가 쓴 문장');
  expect(
    renderToStaticMarkup(
      createElement(CaptionEditor, { store, id, mock: true }),
    ),
  ).toContain('사용자 작성');
  store.getState().movePhoto(id, 0);
  for (const slot of store.getState().draft?.slots ?? [])
    store.getState().editCaption(slot.photo_id, '');
  const exported = store.getState().exportDraft();
  expect(exported.slots[0].photo_id).toBe(id);
  expect(exported.slots.every((slot) => slot.text === null)).toBe(true);
  expect(
    exported.slots.every((slot) =>
      slot.evidence.some((item) => item.kind === 'uploaded_photo'),
    ),
  ).toBe(true);
  expect(exportText(exported)).toContain(
    `01 · ${id}\n[비움] 직접 비워 두었어요.`,
  );
  markup = renderToStaticMarkup(
    createElement(OutputControls, { store, mock: true }),
  );
  expect(markup).toContain('JSON 받기');
  expect(markup).toContain('텍스트 받기');
  expect(markup).not.toMatch(/완성률|\d+\/\d+ 완성/);
  expect(fetcher).not.toHaveBeenCalled();
});
test('invalid injected output cannot overwrite an existing draft', async () => {
  const store = createEditorStore();
  await store.getState().loadFeed(async () => response());
  await store.getState().generate(undefined, previewOutput);
  const before = store.getState().draft;
  await store
    .getState()
    .generate(undefined, async () => ({ output: { title: 'bad', slots: [] } }));
  expect(store.getState().request.status).toBe('error');
  expect(store.getState().draft).toBe(before);
  const input: GenerateRequest = {
    ...response(),
    schema_version: '1.0',
    mode: 'all',
  };
  const abort = new AbortController();
  abort.abort();
  await expect(previewOutput(input, abort.signal)).rejects.toThrow();
});
