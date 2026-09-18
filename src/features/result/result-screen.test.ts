import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { FeedResponse } from '@/types/contracts';
import fixture from '../../../fixtures/interaction.sample.json';
import { buildFeed } from '../../../lib/pipeline.js';
import type { EditorStore } from '../editor/store';
import { createEditorStore } from '../editor/store';
import { deltaSentence, ResultScreen } from './result-screen';

// Server rendering checks markup; client keyboard/drag behavior is verified in Chrome.
vi.mock('zustand', () => ({
  useStore: (
    store: EditorStore,
    selector: (state: ReturnType<EditorStore['getState']>) => unknown,
  ) => selector(store.getState()),
}));

test('3/15/20 photo-only result slots retain ID, source position and evidence after reorder', async () => {
  for (const count of [3, 15, 20]) {
    const photos = Array.from({ length: count }, (_, i) => ({
      ...fixture.context.photos[0],
      photo_id: `qa_${i}`,
      input_index: i,
      file_ref: `${i}.jpg`,
      analysis_source: 'heuristic',
      model: 'test-only',
    }));
    const store = createEditorStore();
    await store.getState().loadFeed(() =>
      buildFeed({
        schema_version: '1.0',
        session_id: 'qa',
        photos,
        identity: { current: { kind: 'none' }, target: { kind: 'none' } },
      }),
    );
    const original = structuredClone(store.getState().original);
    store.getState().movePhoto('qa_0', count - 1);
    const markup = renderToStaticMarkup(createElement(ResultScreen, { store }));
    expect(markup.match(/근거 보기/g) ?? []).toHaveLength(count);
    expect(markup).toContain('개인화 정보 없이');
    expect(markup).toContain('다시 계산하지 않았어요');
    expect(markup).toContain(`${count}번 사진 이동`);
    expect(store.getState().order.at(-1)).toBe('qa_0');
    expect(store.getState().original).toEqual(original);
  }
});
test('correction copy exposes exact resolved number and distinguishes target-only from photo-only', async () => {
  const delta = {
    current: 120,
    target: 20,
    resolved: 48.98979485566356,
    note_key: 'caption_len_gap',
    field: 'language.caption_len.p50',
    rule: 'log_midpoint',
    evidence: [],
  } as const;
  expect(deltaSentence({ ...delta, evidence: [] })).toContain(
    '48.98979485566356자',
  );
  const store = createEditorStore();
  await store.getState().loadFeed(
    async () =>
      structuredClone({
        feed: fixture.feed,
        context: fixture.context,
      }) as FeedResponse,
  );
  const markup = renderToStaticMarkup(createElement(ResultScreen, { store }));
  expect(markup).toContain('현재 스타일은 순서와 문장에 반영하지 않았어요');
  expect(markup).not.toContain('개인화 정보 없이');
  expect(markup).not.toMatch(/이처럼|또한|이를 통해|이러한|마침내/);
});
