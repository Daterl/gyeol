'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { loadSample, type SampleSlot } from './sample';

type PreviewState =
  | { status: 'idle' | 'loading' }
  | { message: string; status: 'error' }
  | { slots: SampleSlot[]; status: 'success' };

export function SamplePreview() {
  const [state, setState] = useState<PreviewState>({ status: 'idle' });
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current?.abort();
    },
    [],
  );

  async function showSample() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'loading' });
    try {
      const slots = await loadSample(controller.signal);
      if (!controller.signal.aborted) setState({ slots, status: 'success' });
    } catch {
      if (!controller.signal.aborted) {
        setState({
          message:
            '샘플을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
          status: 'error',
        });
      }
    }
  }

  return (
    <section
      aria-labelledby="sample-heading"
      className="rounded-[20px] border border-line bg-card p-6 shadow-paper sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="mb-2 font-mono text-xs tracking-widest text-accent">
            미리 살펴보기
          </p>
          <h2 id="sample-heading" className="text-xl font-bold tracking-tight">
            사진 사이에, 나다운 흐름을.
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">
            순서와 그 이유를 고정 샘플로 살펴보세요. 실제 사진 분석이나 개인화
            결과는 아닙니다.
          </p>
        </div>
        <Button
          className="min-h-11 rounded-xl px-5 py-3 font-semibold"
          disabled={state.status === 'loading'}
          onClick={showSample}
          type="button"
        >
          {state.status === 'loading'
            ? '샘플을 불러오는 중…'
            : state.status === 'error'
              ? '다시 시도하기'
              : '샘플 순서 살펴보기'}
        </Button>
      </div>
      <p aria-live="polite" className="mt-4 text-sm text-muted-foreground">
        {state.status === 'success'
          ? `${state.slots.length}개의 샘플 자리를 불러왔어요.`
          : state.status === 'loading'
            ? '잠시만 기다려 주세요.'
            : null}
      </p>
      {state.status === 'error' && (
        <p
          className="mt-2 rounded-xl border border-amber-line bg-amber-soft p-4 text-sm text-amber"
          role="alert"
        >
          {state.message}
        </p>
      )}
      {state.status === 'success' && (
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.slots.map((slot) => (
            <li
              className="rounded-xl border border-line-soft bg-paper p-4"
              key={slot.photo_id}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-mono text-lg text-accent">
                  {String(slot.position).padStart(2, '0')}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {slot.photo_id}
                </span>
              </div>
              <p className="text-sm leading-6">{slot.rationale.value}</p>
              <details className="mt-3 text-xs leading-6 text-muted-foreground">
                <summary className="cursor-pointer font-semibold text-accent">
                  근거 보기
                </summary>
                <ul className="mt-2 border-l-2 border-accent-line pl-3">
                  {slot.rationale.evidence.map((evidence, index) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Fixed sample evidence never reorders and contains no local state.
                    <li key={index}>{evidence.note}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-6 border-t border-line-soft pt-4 text-xs leading-6 text-muted-foreground">
        내 사진 업로드와 편집 기능은 준비 중입니다. 지금은 샘플만 확인할 수
        있어요.
      </p>
    </section>
  );
}
