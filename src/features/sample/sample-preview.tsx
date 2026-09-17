'use client';

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import type { F3Export, FeedResponse } from '@/types/contracts';
import sample from '../../../fixtures/sample_result.json';
import { createEditorStore } from '../editor/store';
import { ResultScreen } from '../result/result-screen';

export function SamplePreview() {
  const [store] = useState(createEditorStore);
  const original = useStore(store, (state) => state.original);
  const request = useStore(store, (state) => state.request);
  useEffect(() => () => store.getState().reset(), [store]);
  async function openSample() {
    await store
      .getState()
      .loadFeed(async () => structuredClone(sample.response) as FeedResponse);
    if (store.getState().original)
      await store.getState().generate(undefined, async () => ({
        output: structuredClone(sample.output) as F3Export,
      }));
  }
  return (
    <section aria-label="합성 샘플" className="mb-8 border-y border-line py-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-medium">사진을 고르기 전에, 먼저 만져 보세요.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            커피, 초록 잎, 바다. 합성 이미지 3장으로 준비한 편집 예시예요.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={request.status === 'loading'}
          onClick={() =>
            original ? store.getState().reset() : void openSample()
          }
        >
          {original ? '샘플 닫기' : '샘플로 바로 보기'}
        </Button>
      </div>
      {request.status === 'error' && !original && (
        <p role="alert" className="mt-3 text-destructive">
          샘플을 열지 못했어요. 다시 시도해 주세요.
        </p>
      )}
      <ResultScreen store={store} mock sampleImages={sample.images} />
    </section>
  );
}
