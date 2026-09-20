'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { CaptionEditor, OutputControls } from '../captions/caption-editor';
import type { CurationEditorStore } from '../editor/curation-store';
import { ShareControls } from '../share/share-controls';

export function carouselSwipeOffset(
  start: number | null,
  end: number | undefined,
) {
  if (start === null || end === undefined || Math.abs(end - start) < 40)
    return 0;
  return end < start ? 1 : -1;
}

export function CurationPreview({
  store,
  mock = false,
  canGenerate = true,
  generationNotice,
}: {
  store: CurationEditorStore;
  mock?: boolean;
  canGenerate?: boolean;
  generationNotice?: string;
}) {
  const state = useStore(store, (value) => value);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const touchStartX = useRef<number | null>(null);
  if (!state.original) return null;
  const included = state.order.filter(
    (value) => !state.excluded.includes(value),
  );
  const id =
    selected && state.order.includes(selected)
      ? selected
      : (included[0] ?? state.order[0]);
  const index = state.order.indexOf(id);
  const carouselIndex = included.indexOf(id);
  const photo = state.photos.find((item) => item.photo_id === id);
  const crop = state.crops[id] ?? { x: 50, y: 50 };
  const excluded = state.excluded.includes(id);
  const recommendation = state.curation?.slots.find(
    (slot) => slot.photo_id === id,
  )?.exclusion_candidate;
  const omitted =
    state.draft?.slots.filter(
      (slot) =>
        included.includes(slot.photo_id) && slot.caption_state === 'omitted',
    ).length ?? 0;
  function move(photoId: string, destination: number) {
    if (destination < 0 || destination >= state.order.length) return;
    store.getState().movePhoto(photoId, destination);
    setSelected(photoId);
    setNotice(`${destination + 1}번 자리로 옮겼어요.`);
  }
  function moveInCarousel(photoId: string, destination: number) {
    const target = included[destination];
    if (target) move(photoId, state.order.indexOf(target));
  }
  function selectInCarousel(offset: number) {
    const next = included[carouselIndex + offset];
    if (next) setSelected(next);
  }
  return (
    <section
      className="mt-8 border-t border-line pt-6"
      aria-label="큐레이션 프리뷰"
    >
      <h2 className="text-2xl font-semibold">3. 프리뷰를 다듬어 주세요</h2>
      {!canGenerate && (
        <p role="status" className="mt-3 text-sm">
          {generationNotice ??
            '프로필을 다시 연결해 주세요. 사진과 편집한 내용은 그대로 남아 있고, 연결 전에는 새 문장을 생성하지 않아요.'}
        </p>
      )}
      <p className="my-3 text-sm text-muted-foreground">
        기본은 모든 사진을 포함해요. 제외 권고는 자동으로 적용하지 않아요.
        포함한 사진은 한 묶음으로 미리 보고, 첫 사진이 커버가 돼요.
      </p>
      <p className="mb-3 text-sm" data-testid="omission-count">
        사진 {included.length}장 포함 · {state.excluded.length}장 제외
        {state.draft
          ? ` · 포함한 사진 중 캡션 ${omitted}개 비움`
          : ' · 캡션 준비 전'}
      </p>
      <div className="mb-3 border-y border-line py-3 text-sm">
        {state.profileSharing && state.curation ? (
          <div>
            <a
              href={state.curation.profile.source_url}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 flex-wrap items-center gap-2 text-[#00376b]"
            >
              {state.curation.profile.display?.display_name && (
                <span>{state.curation.profile.display.display_name}</span>
              )}
              <span>
                @
                {state.curation.profile.display?.username ??
                  new URL(state.curation.profile.source_url).pathname
                    .split('/')
                    .filter(Boolean)[0]}
              </span>
            </a>
            {state.curation.profile.display?.name_source ===
              'apify.ownerFullName' && (
              <p className="text-muted-foreground">
                표시 이름 출처: 공개 게시물 작성자 정보
              </p>
            )}
          </div>
        ) : (
          <p className="font-semibold">GYEOL · 나의 사진 기록</p>
        )}
      </div>
      <section className="overflow-x-hidden" aria-label="사진 캐러셀">
        <div
          className="relative aspect-[4/5] overflow-hidden bg-line-soft"
          onTouchStart={(event) => {
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const offset = excluded
              ? 0
              : carouselSwipeOffset(
                  touchStartX.current,
                  event.changedTouches[0]?.clientX,
                );
            touchStartX.current = null;
            if (offset) selectInCarousel(offset);
          }}
        >
          {photo && (
            <Image
              src={photo.url}
              alt={photo.file.name}
              fill
              unoptimized
              sizes="(min-width: 640px) 36rem, 100vw"
              className="object-cover"
              style={{ objectPosition: `${crop.x}% ${crop.y}%` }}
            />
          )}
          {!excluded && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={carouselIndex === 0}
                onClick={() => selectInCarousel(-1)}
                aria-label="이전 사진"
                className="absolute top-1/2 left-3 -translate-y-1/2 bg-card/90"
              >
                이전
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={carouselIndex === included.length - 1}
                onClick={() => selectInCarousel(1)}
                aria-label="다음 사진"
                className="absolute top-1/2 right-3 -translate-y-1/2 bg-card/90"
              >
                다음
              </Button>
            </>
          )}
          <p className="absolute right-3 bottom-3 rounded bg-black/70 px-2 py-1 text-xs text-white">
            {excluded
              ? '제외한 사진'
              : `${carouselIndex + 1} / ${included.length}${carouselIndex === 0 ? ' · 커버' : ''}`}
          </p>
        </div>
        <label className="mt-3 block text-sm">
          보고 있는 사진
          <select
            value={excluded ? '' : id}
            onChange={(event) => setSelected(event.target.value)}
            className="mt-1 block min-h-11 w-full rounded-md border border-line bg-card px-3"
          >
            {excluded && (
              <option value="" disabled>
                제외한 사진을 복원하거나 다른 사진을 선택하세요
              </option>
            )}
            {included.map((photoId, position) => (
              <option key={photoId} value={photoId}>
                {position + 1}번 사진{position === 0 ? ' · 커버' : ''}
              </option>
            ))}
          </select>
        </label>
        {state.excluded.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">제외한 사진</span>
            {state.excluded.map((photoId) => (
              <Button
                key={photoId}
                type="button"
                variant="outline"
                onClick={() => setSelected(photoId)}
              >
                {state.order.indexOf(photoId) + 1}번 편집
              </Button>
            ))}
          </div>
        )}
      </section>
      <fieldset
        className="mt-5 space-y-3 rounded-md border border-line p-4"
        aria-label={
          excluded
            ? `${index + 1}번 제외한 사진 편집`
            : `${carouselIndex + 1}번 사진 편집`
        }
      >
        <h3 className="font-semibold">
          {excluded
            ? `${index + 1}번 사진 · 제외됨`
            : `${carouselIndex + 1}번 사진${carouselIndex === 0 ? ' · 커버' : ''}`}
        </h3>
        {photo && (
          <a
            href={photo.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center text-sm underline"
          >
            원본 비율로 사진 보기
          </a>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={excluded ? index === 0 : carouselIndex === 0}
            onClick={() =>
              excluded
                ? move(id, index - 1)
                : moveInCarousel(id, carouselIndex - 1)
            }
          >
            앞으로
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={
              excluded
                ? index === state.order.length - 1
                : carouselIndex === included.length - 1
            }
            onClick={() =>
              excluded
                ? move(id, index + 1)
                : moveInCarousel(id, carouselIndex + 1)
            }
          >
            뒤로
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              state.setIncluded(id, excluded);
              if (!excluded)
                setSelected(included.find((photoId) => photoId !== id) ?? null);
              setNotice(
                excluded
                  ? '사진을 복원했어요.'
                  : '사진을 제외했어요. 언제든 복원할 수 있어요.',
              );
            }}
          >
            {excluded ? '사진 복원' : '사진 제외'}
          </Button>
        </div>
        {recommendation?.recommended && (
          <div className="text-sm">
            <p>제외 후보: {recommendation.reason}</p>
            {recommendation.evidence.map((evidence) => (
              <p key={`${evidence.kind}-${evidence.ref}`}>{evidence.note}</p>
            ))}
          </div>
        )}
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">그리드 썸네일 중심</legend>
          {(['x', 'y'] as const).map((axis) => (
            <label key={axis} className="block text-sm">
              {axis === 'x' ? '가로' : '세로'} 중심 {crop[axis]}%
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={crop[axis]}
                onChange={(event) =>
                  state.setCrop(id, {
                    ...crop,
                    [axis]: Number(event.target.value),
                  })
                }
                className="block min-h-11 w-full accent-accent"
              />
            </label>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() => state.setCrop(id, { x: 50, y: 50 })}
          >
            중앙으로 되돌리기
          </Button>
        </fieldset>
        <CaptionEditor
          store={store}
          id={id}
          mock={mock}
          confirmPaid
          generationDisabled={!canGenerate}
        />
      </fieldset>
      <OutputControls
        store={store}
        mock={mock}
        confirmPaid
        allowExport={false}
        generationDisabled={!canGenerate}
      />
      <label className="flex min-h-11 items-start gap-3 py-3 text-sm">
        <input
          type="checkbox"
          checked={state.profileSharing}
          onChange={(event) => state.setProfileSharing(event.target.checked)}
          className="mt-1 size-5 shrink-0"
        />
        공유에 공개 프로필 정보 포함 (기본 꺼짐)
      </label>
      <p className="mb-4 text-sm text-muted-foreground">
        이 선택은 프로필 주체의 동의나 소유권 인증이 아니에요. 끄면 확정
        스냅샷에 프로필 정보가 들어가지 않고 GYEOL 일반 헤더를 사용해요. 현재
        연결에서 받은 사용자명과, 제공된 경우에만 표시 이름을 포함해요. 프로필
        사진은 제공되지 않았어요.
      </p>
      {included.length < 3 && (
        <p className="mb-3 text-sm text-amber" role="status">
          큐레이션을 확정하려면 사진을 3장 이상 포함해 주세요.
        </p>
      )}
      <Button
        type="button"
        disabled={
          !state.draft?.title.trim() ||
          included.length < 3 ||
          state.request.status === 'loading'
        }
        onClick={() => {
          try {
            state.confirmCuration();
            setNotice(
              '현재 편집본을 확정했어요. 이후 편집은 다시 확정하기 전까지 확정본에 반영되지 않아요.',
            );
          } catch (error) {
            setNotice(
              error instanceof Error ? error.message : '확정하지 못했어요.',
            );
          }
        }}
      >
        큐레이션 확정
      </Button>
      {state.confirmed && (
        <>
          <p className="mt-3 text-sm">
            확정본: {state.confirmed.output.slots.length}장 · 프로필{' '}
            {state.confirmed.profileSharing ? '포함' : '미포함'}
          </p>
          <ShareControls confirmed={state.confirmed} photos={state.photos} />
        </>
      )}
      <p role="status" className="mt-3 text-sm">
        {notice}
      </p>
    </section>
  );
}
