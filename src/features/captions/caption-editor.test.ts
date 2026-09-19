import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import type {
  FeedResponse,
  GenerateRequest,
  OrderedFeed,
} from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';
import * as editorModule from '../editor/store';
import { createEditorStore, type EditorStore } from '../editor/store';
import { exportText } from '../export/export';
import { PhotoInput } from '../input/photo-input';
import { CaptionEditor, OutputControls } from './caption-editor';
import { previewOutput } from './preview-output';

vi.mock('zustand', () => ({
  useStore: (
    store: EditorStore,
    selector: (state: ReturnType<EditorStore['getState']>) => unknown,
  ) => selector(store.getState()),
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
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
  expect(
    exportText(
      store.getState().exportDraft(),
      fixture.feed as unknown as OrderedFeed,
    ),
  ).toContain('[AI 쓸 거리]');
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
  ).toContain('쓸 거리 제안');
  store.getState().editCaption(id, '내가 쓴 문장');
  expect(
    exportText(
      store.getState().exportDraft(),
      fixture.feed as unknown as OrderedFeed,
    ),
  ).toContain('[내 문장] 내가 쓴 문장');
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
  const text = exportText(exported, fixture.feed as unknown as OrderedFeed);
  expect(text).toContain(`01 · ${id}\n[비움] 직접 비워 두었어요.`);
  // 재정렬·캡션 편집 뒤에도 처음 제안한 자리의 근거가 photo_id 를 따라온다.
  const source = fixture.feed.slots.find((slot) => slot.photo_id === id);
  expect(text).toContain(`처음 제안 ${source?.position}번`);
  expect(text).toContain(`자리 근거: ${source?.rationale.value}`);
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

test('caption failure never offers a photo upload retry', async () => {
  const store = createEditorStore();
  await store.getState().loadFeed(async () => response());
  await store.getState().generate(undefined, async () => {
    throw new Error('failed caption');
  });
  vi.spyOn(editorModule, 'createEditorStore').mockReturnValue(store);
  const markup = renderToStaticMarkup(
    createElement(PhotoInput, { mock: true }),
  );
  expect(markup).not.toContain('>다시 시도하기</button>');
  expect(markup).toContain('>큐레이션 만들기</button>');
});

test('companion follows the actual editor lifecycle and cancellation', async () => {
  const store = createEditorStore();
  vi.spyOn(editorModule, 'createEditorStore').mockReturnValue(store);
  const image = () =>
    renderToStaticMarkup(createElement(PhotoInput, { mock: true }));
  expect(image()).toContain('/images/gyeol-character/default.webp');
  let finish!: (value: FeedResponse) => void;
  const pending = store.getState().loadFeed(
    () =>
      new Promise<FeedResponse>((resolve) => {
        finish = resolve;
      }),
  );
  expect(image()).toContain('/images/gyeol-character/working.webp');
  store.getState().cancel();
  finish(response());
  await pending;
  expect(image()).toContain('/images/gyeol-character/default.webp');
  await store.getState().loadFeed(async () => response());
  expect(image()).toContain('/images/gyeol-character/complete.webp');
  await store.getState().generate(undefined, async () => {
    throw new Error('caption failed');
  });
  expect(image()).toContain('/images/gyeol-character/recovery.webp');
  store.getState().reset();
  expect(image()).toContain('/images/gyeol-character/default.webp');
});
