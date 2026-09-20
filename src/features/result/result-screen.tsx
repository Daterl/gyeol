'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import deltaCopy from '@/copy/deltas.ko.json';
import type { AppliedProfile } from '@/types/contracts';
import { CaptionEditor, OutputControls } from '../captions/caption-editor';
import type { EditorStore } from '../editor/store';

export function deltaSentence(delta: AppliedProfile['deltas'][number]) {
  return deltaCopy[delta.note_key]
    .replace('{current}', String(delta.current))
    .replace('{target}', String(delta.target))
    .replace('{resolved}', String(delta.resolved));
}

export function carouselIndex(order: string[], activePhoto: string | null) {
  const index = activePhoto ? order.indexOf(activePhoto) : 0;
  return index < 0 ? 0 : index;
}

export function ResultScreen({
  store,
  mock = false,
  sampleImages,
}: {
  store: EditorStore;
  mock?: boolean;
  sampleImages?: Record<string, { src: string; alt: string }>;
}) {
  const original = useStore(store, (state) => state.original);
  const order = useStore(store, (state) => state.order);
  const photos = useStore(store, (state) => state.photos);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const touchStart = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [activePhoto, setActivePhoto] = useState<string | null>(null);
  useEffect(() => {
    setAnnouncement('');
    if (original) {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: 'start' });
    }
  }, [original]);
  if (!original) return null;
  const { feed, context } = original;
  const activeIndex = carouselIndex(order, activePhoto);
  const photoOnly = 'kind' in context.target;
  const moved = order.some(
    (id, index) =>
      feed.slots.find((slot) => slot.photo_id === id)?.position !== index + 1,
  );
  function move(id: string, destination: number) {
    setActivePhoto(id);
    store.getState().movePhoto(id, destination);
    setAnnouncement(
      `사진을 ${destination + 1}번 자리로 옮겼어요. 원래 제안 근거는 그대로예요.`,
    );
    requestAnimationFrame(() => handles.current.get(id)?.focus());
  }
  function show(index: number) {
    const id = order[index];
    if (id) {
      setActivePhoto(id);
      setAnnouncement(`${index + 1}번 사진을 보고 있어요.`);
    }
  }
  return (
    <section
      className="my-7 border-t border-line pt-6"
      aria-labelledby={headingId}
    >
      <p className="mb-3 font-mono text-xs tracking-widest text-accent">
        사진 사이의 흐름
      </p>
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight"
      >
        이 순서로 놓아봤어요.
      </h2>
      <p className="mt-3 text-muted-foreground">
        {order.length}장의 사진, 마음에 드는 흐름으로 고쳐 보세요.
      </p>
      <div className="my-4 border-y border-line py-3 text-sm leading-6 text-muted-foreground">
        <p>
          {sampleImages
            ? 'AI로 만든 이미지와 사전 작성한 순서·문장 예시예요. 실제 계정이나 실시간 모델 분석 결과는 아니에요.'
            : photoOnly
              ? '개인화 정보 없이 사진을 바탕으로 준비했어요. 계정 취향이나 문체를 추측하지 않았어요.'
              : feed.applied_profile.disclosure === 'target_only'
                ? '현재 스타일은 순서와 문장에 반영하지 않았어요. 입력한 지향만 사용했어요.'
                : '기존 계정과 입력한 지향을 함께 보고 조정했어요.'}
        </p>
        {!sampleImages &&
          context.photos.some(
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
      <p className="mb-3 text-sm text-muted-foreground">
        {moved
          ? '순서를 직접 바꿨어요. 아래 근거는 처음 제안한 자리의 설명이며 다시 계산하지 않았어요.'
          : '좌우로 사진을 넘겨 보고, 아래 순서 버튼으로 흐름을 바꿀 수 있어요.'}
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <OutputControls store={store} mock={mock} />
      {feed.concept ? (
        <section className="mb-8 border-t border-line pt-6">
          <p className="text-sm leading-7">{feed.concept.value}</p>
          <details className="mt-2 text-sm">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-accent">
              묶음 근거 보기
            </summary>
            <ul className="space-y-2 border-l-2 border-accent-line pl-3 text-muted-foreground">
              {feed.concept.evidence.map((evidence, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Feed-level evidence never reorders with the photos.
                <li key={`concept-${evidence.kind}-${evidence.ref}-${i}`}>
                  {evidence.note}
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
      <ol className="mx-auto max-w-3xl" aria-label="사진 캐러셀">
        {order.map((id, index) => {
          const slot = feed.slots.find((item) => item.photo_id === id);
          const photo = photos.find((item) => item.photo_id === id);
          const image = photo
            ? { src: photo.url, alt: photo.file.name }
            : sampleImages?.[id];
          const analysis = context.photos.find((item) => item.photo_id === id);
          if (!slot) return null;
          return (
            <li
              key={id}
              hidden={index !== activeIndex}
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
              <div
                className="relative mb-3 touch-pan-y"
                onTouchStart={(event) => {
                  touchStart.current = event.changedTouches[0]?.clientX ?? null;
                }}
                onTouchEnd={(event) => {
                  const start = touchStart.current;
                  const end = event.changedTouches[0]?.clientX;
                  touchStart.current = null;
                  if (start === null || end === undefined) return;
                  if (start - end > 40)
                    show(Math.min(index + 1, order.length - 1));
                  if (end - start > 40) show(Math.max(index - 1, 0));
                }}
              >
                {image ? (
                  <a
                    href={image.src}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${index + 1}번 ${image.alt} 원본 보기`}
                    className="relative block aspect-[4/5] overflow-hidden border border-line bg-line-soft shadow-sm"
                  >
                    <Image
                      src={image.src}
                      alt={image.alt}
                      fill
                      unoptimized={Boolean(photo)}
                      loading={index === activeIndex ? 'eager' : 'lazy'}
                      sizes="(min-width:640px) 640px, 90vw"
                      className="object-contain"
                    />
                  </a>
                ) : (
                  <div className="relative flex aspect-[4/5] items-center justify-center border border-line bg-line-soft p-3 text-sm shadow-sm">
                    {analysis?.file_ref ?? '사진 원본이 없어요.'}
                  </div>
                )}
                <span className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1.5 text-sm font-medium text-white">
                  {index + 1}/{order.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="absolute left-3 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-full bg-card/90 p-0 shadow-sm"
                  disabled={index === 0}
                  onClick={() => show(index - 1)}
                  aria-label="이전 사진"
                >
                  ←
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="absolute right-3 top-1/2 min-h-11 min-w-11 -translate-y-1/2 rounded-full bg-card/90 p-0 shadow-sm"
                  disabled={index === order.length - 1}
                  onClick={() => show(index + 1)}
                  aria-label="다음 사진"
                >
                  →
                </Button>
              </div>
              {index === activeIndex && (
                <div
                  className="mb-6 flex justify-center gap-1.5"
                  aria-hidden="true"
                >
                  {order.map((photoId, photoIndex) => (
                    <span
                      key={photoId}
                      className={`size-2 rounded-full ${
                        photoIndex === index ? 'bg-accent' : 'bg-line'
                      }`}
                    />
                  ))}
                </div>
              )}
              <div className="min-w-0">
                <CaptionEditor store={store} id={id} mock={mock} />
              </div>
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
                  순서 앞으로
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 flex-1"
                  disabled={index === order.length - 1}
                  onClick={() => move(id, index + 1)}
                  aria-label={`${index + 1}번 사진 뒤로`}
                >
                  순서 뒤로
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
