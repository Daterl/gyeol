import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import type { FeedResponse } from '@/types/contracts';
import sample from '../../../fixtures/sample_result.json';
import type { EditorStore } from '../editor/store';
import { createEditorStore } from '../editor/store';
import { carouselIndex, ResultScreen } from './result-screen';

vi.mock('zustand', () => ({
  useStore: (
    store: EditorStore,
    selector: (state: ReturnType<EditorStore['getState']>) => unknown,
  ) => selector(store.getState()),
}));

test('sample detail starts as one carousel slide with a count and position dots', async () => {
  const store = createEditorStore();
  await store
    .getState()
    .loadFeed(async () => structuredClone(sample.response) as FeedResponse);

  const markup = renderToStaticMarkup(
    createElement(ResultScreen, {
      store,
      mock: true,
      sampleImages: sample.images,
    }),
  );

  expect(markup).toContain('aria-label="사진 캐러셀"');
  expect(markup).toContain('>1/3<');
  expect(markup.match(/hidden=""/g) ?? []).toHaveLength(2);
  expect(markup.match(/size-2 rounded-full/g) ?? []).toHaveLength(3);
});

test('reordering the first slide keeps that photo active', () => {
  expect(carouselIndex(['second', 'third', 'first'], 'first')).toBe(2);
});
