'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import deltaCopy from '@/copy/deltas.ko.json';
import type { AppliedProfile } from '@/types/contracts';
import type { EditorStore } from '../editor/store';

export function deltaSentence(delta: AppliedProfile['deltas'][number]) {
  return deltaCopy[delta.note_key]
    .replace('{current}', String(delta.current))
    .replace('{target}', String(delta.target))
    .replace('{resolved}', String(delta.resolved));
}

export function ResultScreen({ store }: { store: EditorStore }) {
  const original = useStore(store, (state) => state.original);
  const order = useStore(store, (state) => state.order);
  const photos = useStore(store, (state) => state.photos);
  const heading = useRef<HTMLHeadingElement>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (original) heading.current?.focus();
  }, [original]);
  if (!original) return null;
  const { feed, context } = original;
  const photoOnly = 'kind' in context.target;
  const moved = order.some(
    (id, index) =>
      feed.slots.find((slot) => slot.photo_id === id)?.position !== index + 1,
  );
  function move(id: string, destination: number) {
    store.getState().movePhoto(id, destination);
    setAnnouncement(
      `사진을 ${destination + 1}번 자리로 옮겼어요. 원래 제안 근거는 그대로예요.`,
    );
    requestAnimationFrame(() => handles.current.get(id)?.focus());
  }
  return (
    <section
      className="my-12 border-t border-line pt-10"
      aria-labelledby="result-heading"
    >
      <p className="mb-3 font-mono text-xs tracking-widest text-accent">
        사진 사이의 흐름
      </p>
      <h2
        id="result-heading"
        ref={heading}
        tabIndex={-1}
        className="text-3xl font-semibold tracking-tight"
      >
        이 순서로 놓아봤어요.
      </h2>
      <p className="mt-3 text-muted-foreground">
        {order.length}장의 사진, 마음에 드는 흐름으로 고쳐 보세요.
      </p>
      <div className="my-6 border-l-4 border-accent bg-accent-soft px-4 py-3 text-sm leading-7">
        <p>
          {photoOnly
            ? '개인화 정보 없이 사진을 바탕으로 준비했어요. 계정 취향이나 문체를 추측하지 않았어요.'
            : feed.applied_profile.disclosure === 'target_only'
              ? '기존 계정과 비교한 보정은 없어요. 입력한 지향을 사용했어요.'
              : '기존 계정과 입력한 지향을 함께 보고 조정했어요.'}
        </p>
        {context.photos.some(
          (photo) => photo.analysis_source === 'heuristic',
        ) && (
          <p>
            사진의 픽셀만 확인한 항목이 있어요. 처음에는 선택한 순서를
            유지했으니 직접 옮겨 보세요.
          </p>
        )}
        {feed.applied_profile.deltas.map((delta) => (
          <p key={delta.field}>{deltaSentence(delta)}</p>
        ))}
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        {moved
          ? '순서를 직접 바꿨어요. 아래 근거는 처음 제안한 자리의 설명이며 다시 계산하지 않았어요.'
          : '번호 손잡이를 끌거나 앞·뒤로 버튼으로 옮길 수 있어요.'}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <ol className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {order.map((id, index) => {
          const slot = feed.slots.find((item) => item.photo_id === id);
          const photo = photos.find((item) => item.photo_id === id);
          const analysis = context.photos.find((item) => item.photo_id === id);
          if (!slot) return null;
          return (
            <li
              key={id}
              className="min-w-0 border-b border-line pb-6"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dragged = event.dataTransfer.getData('text/gyeol-photo');
                if (order.includes(dragged) && dragged !== id)
                  move(dragged, index);
              }}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  draggable
                  ref={(element) => {
                    if (element) handles.current.set(id, element);
                    else handles.current.delete(id);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/gyeol-photo', id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onKeyDown={(event) => {
                    const next =
                      event.key === 'ArrowUp'
                        ? index - 1
                        : event.key === 'ArrowDown'
                          ? index + 1
                          : null;
                    if (next !== null) {
                      event.preventDefault();
                      if (next >= 0 && next < order.length) move(id, next);
                    }
                  }}
                  aria-label={`${index + 1}번 사진 이동. 위아래 방향키로 옮기기`}
                  className="min-h-11 min-w-11 cursor-grab font-mono text-2xl text-accent active:cursor-grabbing"
                >
                  {String(index + 1).padStart(2, '0')}
                </button>
                <span className="text-xs text-muted-foreground">
                  처음 제안 {slot.position}번
                </span>
              </div>
              {photo ? (
                <a
                  href={photo.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${index + 1}번 ${photo.file.name} 원본 보기`}
                  className="relative block aspect-[4/5] overflow-hidden rounded-md bg-line-soft"
                >
                  <Image
                    src={photo.url}
                    alt={photo.file.name}
                    fill
                    unoptimized
                    sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 90vw"
                    className="object-contain"
                  />
                </a>
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center bg-line-soft p-6 text-sm">
                  {analysis?.file_ref ?? '사진 원본이 없어요.'}
                </div>
              )}
              <p className="mt-4 text-sm leading-7">{slot.rationale.value}</p>
              <details className="mt-2 text-sm">
                <summary className="min-h-11 cursor-pointer py-3 font-medium text-accent">
                  근거 보기
                </summary>
                <ul className="space-y-2 border-l-2 border-accent-line pl-3 text-muted-foreground">
                  {slot.rationale.evidence.map((evidence, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: Original evidence never reorders; only its parent photo moves.
                    <li key={`${evidence.kind}-${evidence.ref}-${i}`}>
                      {evidence.note}
                    </li>
                  ))}
                </ul>
              </details>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1"
                  disabled={index === 0}
                  onClick={() => move(id, index - 1)}
                  aria-label={`${index + 1}번 사진 앞으로`}
                >
                  앞으로
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1"
                  disabled={index === order.length - 1}
                  onClick={() => move(id, index + 1)}
                  aria-label={`${index + 1}번 사진 뒤로`}
                >
                  뒤로
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
