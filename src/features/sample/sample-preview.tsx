'use client';

import Image from 'next/image';
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
    <section
      aria-label="합성 샘플"
      className="overflow-hidden rounded-xl border border-line bg-card"
    >
      <div
        className={
          original
            ? 'flex flex-wrap items-center justify-between gap-4 border-b border-line p-4 sm:p-5'
            : ''
        }
      >
        {!original && (
          <div>
            <div className="flex items-center gap-3 p-4 sm:p-5">
              <Image
                src="/images/gyeol-character/default.webp"
                alt=""
                width={48}
                height={48}
                className="size-12 rounded-full bg-line-soft object-contain"
              />
              <div className="min-w-0">
                <p className="font-semibold">gyeol.preview</p>
                <p className="text-sm text-muted-foreground">
                  세 장의 사진 · 하나의 흐름
                </p>
              </div>
            </div>
            <div className="relative" aria-hidden="true">
              <Image
                src={Object.values(sample.images)[0].src}
                alt=""
                width={1122}
                height={1403}
                sizes="(min-width:1024px) 38vw, 100vw"
                loading="eager"
                className="aspect-[4/5] h-auto w-full object-cover"
              />
              <span className="absolute right-3 top-3 rounded-full bg-black/55 p-2">
                <span className="relative block size-7">
                  <span className="absolute left-0 top-0 size-5 rounded-md border-2 border-white" />
                  <span className="absolute bottom-0 right-0 size-5 rounded-md bg-white" />
                </span>
              </span>
            </div>
          </div>
        )}
        <div
          className={
            original
              ? 'flex flex-wrap items-center justify-between gap-4'
              : 'flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5'
          }
        >
          <div>
            <p className="font-medium">
              {original
                ? '샘플 편집 중'
                : '피드가 어떻게 이어지는지 먼저 보세요.'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              커피, 초록 잎, 바다로 준비한 편집 예시예요.
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
      </div>
      {request.status === 'error' && !original && (
        <p role="alert" className="p-4 text-destructive sm:p-5">
          샘플을 열지 못했어요. 다시 시도해 주세요.
        </p>
      )}
      <div className="px-4 sm:px-5">
        <ResultScreen store={store} mock sampleImages={sample.images} />
      </div>
    </section>
  );
}
