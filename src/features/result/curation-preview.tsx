'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { CaptionEditor, OutputControls } from '../captions/caption-editor';
import type { CurationEditorStore } from '../editor/curation-store';

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
  const handles = useRef(new Map<string, HTMLButtonElement>());
  if (!state.original) return null;
  const id =
    selected && state.order.includes(selected) ? selected : state.order[0];
  const index = state.order.indexOf(id);
  const photo = state.photos.find((item) => item.photo_id === id);
  const crop = state.crops[id] ?? { x: 50, y: 50 };
  const excluded = state.excluded.includes(id);
  const recommendation = state.curation?.slots.find(
    (slot) => slot.photo_id === id,
  )?.exclusion_candidate;
  const included = state.order.filter(
    (value) => !state.excluded.includes(value),
  );
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
    requestAnimationFrame(() => handles.current.get(photoId)?.focus());
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
        번호를 끌거나 방향키·앞뒤 버튼으로 순서를 바꿀 수 있어요.
      </p>
      <p className="mb-3 text-sm" data-testid="omission-count">
        사진 {included.length}장 포함 · {state.excluded.length}장 제외
        {state.draft
          ? ` · 포함한 사진 중 캡션 ${omitted}개 비움`
          : ' · 캡션 준비 전'}
      </p>
      <div className="mb-3 border-y border-line py-3 text-sm">
        {state.profileSharing && state.curation ? (
          <a
            href={state.curation.profile.source_url}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-11 items-center text-[#00376b]"
          >
            @
            {
              new URL(state.curation.profile.source_url).pathname
                .split('/')
                .filter(Boolean)[0]
            }
          </a>
        ) : (
          <p className="font-semibold">GYEOL · 나의 사진 기록</p>
        )}
      </div>
      <ol
        className="grid grid-cols-3 gap-1"
        aria-label="정사각형 피드 미리보기"
      >
        {state.order.map((photoId, position) => {
          const item = state.photos.find((entry) => entry.photo_id === photoId);
          const center = state.crops[photoId] ?? { x: 50, y: 50 };
          const hidden = state.excluded.includes(photoId);
          return (
            <li
              key={photoId}
              className="min-w-0"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const dragged = event.dataTransfer.getData('text/gyeol-photo');
                if (state.order.includes(dragged)) move(dragged, position);
              }}
            >
              <button
                type="button"
                draggable
                aria-pressed={id === photoId}
                aria-label={`${position + 1}번 사진${hidden ? ' 제외됨' : ''}. 선택 및 방향키로 이동`}
                className={`relative block aspect-square w-full overflow-hidden bg-line-soft focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-accent ${hidden ? 'opacity-50' : ''}`}
                ref={(element) => {
                  if (element) handles.current.set(photoId, element);
                  else handles.current.delete(photoId);
                }}
                onClick={() => setSelected(photoId)}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/gyeol-photo', photoId);
                  event.dataTransfer.effectAllowed = 'move';
                }}
                onKeyDown={(event) => {
                  const delta = ['ArrowUp', 'ArrowLeft'].includes(event.key)
                    ? -1
                    : ['ArrowDown', 'ArrowRight'].includes(event.key)
                      ? 1
                      : 0;
                  if (delta) {
                    event.preventDefault();
                    move(photoId, position + delta);
                  }
                }}
              >
                {item && (
                  <Image
                    src={item.url}
                    alt={item.file.name}
                    fill
                    unoptimized
                    sizes="150px"
                    className="object-cover"
                    style={{ objectPosition: `${center.x}% ${center.y}%` }}
                  />
                )}
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
                  {position + 1}
                  {hidden ? ' · 제외' : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <fieldset
        className="mt-5 space-y-3 rounded-md border border-line p-4"
        aria-label={`${index + 1}번 사진 편집`}
      >
        <h3 className="font-semibold">
          {index + 1}번 사진 {excluded ? '· 제외됨' : ''}
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
            disabled={index === 0}
            onClick={() => move(id, index - 1)}
          >
            앞으로
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={index === state.order.length - 1}
            onClick={() => move(id, index + 1)}
          >
            뒤로
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              state.setIncluded(id, excluded);
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
        연결에서 받은 정보만 포함하며 프로필 사진·표시 이름은 제공되지 않았어요.
      </p>
      <Button
        type="button"
        disabled={
          !state.draft?.title.trim() ||
          !included.length ||
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
        <p className="mt-3 text-sm">
          확정본: {state.confirmed.output.slots.length}장 · 프로필{' '}
          {state.confirmed.profileSharing ? '포함' : '미포함'}. 현재 브라우저의
          확정본이며 공유 링크는 아직 만들지 않았어요.
        </p>
      )}
      <p role="status" className="mt-3 text-sm">
        {notice}
      </p>
    </section>
  );
}
