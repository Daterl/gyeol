'use client';

import { useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import labels from '@/copy/captions.ko.json';
import type { EditorStore } from '../editor/store';
import { downloadOutput } from '../export/export';
import { previewOutput } from './preview-output';

export function OutputControls({
  store,
  mock = false,
  confirmPaid = false,
  generationDisabled = false,
  allowExport = true,
}: {
  store: EditorStore;
  mock?: boolean;
  confirmPaid?: boolean;
  generationDisabled?: boolean;
  allowExport?: boolean;
}) {
  const draft = useStore(store, (state) => state.draft);
  const request = useStore(store, (state) => state.request);
  const [notice, setNotice] = useState('');
  const loading = request.status === 'loading';
  return (
    <div className="my-5 flex flex-wrap items-end gap-3 border-b border-line pb-5">
      {draft && (
        <label className="block w-full text-sm font-medium sm:max-w-md">
          기록의 제목
          <input
            value={draft.title}
            onChange={(event) => store.getState().editTitle(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-md border border-line bg-card px-3 py-2 text-xl tracking-tight"
          />
        </label>
      )}
      <Button
        type="button"
        className="min-h-11"
        disabled={loading || generationDisabled}
        onClick={() => {
          if (
            confirmPaid &&
            !mock &&
            !window.confirm(
              '문장 생성에 유료 모델 호출이 발생할 수 있어요. 계속할까요?',
            )
          )
            return;
          void store
            .getState()
            .generate(undefined, mock ? previewOutput : undefined);
        }}
      >
        {loading
          ? request.operation === 'feed'
            ? '사진을 확인하는 중…'
            : '문장을 살펴보는 중…'
          : draft
            ? '문장 다시 제안받기'
            : '제목과 문장 제안받기'}
      </Button>
      {draft &&
        allowExport &&
        (['json', 'txt'] as const).map((format) => (
          <Button
            key={format}
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!draft.title.trim()}
            onClick={() => {
              try {
                downloadOutput(store.getState().exportDraft(), format);
                setNotice(
                  `${format === 'json' ? 'JSON' : '텍스트'} 파일을 준비했어요.`,
                );
              } catch {
                setNotice(
                  '제목과 문장을 확인해 주세요. 입력한 내용은 그대로 남아 있어요.',
                );
              }
            }}
          >
            {format === 'json' ? 'JSON 받기' : '텍스트 받기'}
          </Button>
        ))}
      {mock && (
        <p className="w-full text-sm text-muted-foreground">
          문장은 사전 작성한 관찰 예시이며 실시간 모델 결과가 아니에요.
        </p>
      )}
      {loading && request.operation !== 'feed' && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => store.getState().cancel()}
        >
          문장 요청 취소
        </Button>
      )}
      {request.status === 'error' && request.operation !== 'feed' && (
        <p role="alert" className="w-full text-destructive">
          {request.error.message}
        </p>
      )}
      {draft && !draft.title.trim() && (
        <p className="w-full text-sm">내보낼 기록에 제목을 붙여 주세요.</p>
      )}
      <p role="status" className="w-full text-sm">
        {notice}
      </p>
    </div>
  );
}

export function CaptionEditor({
  store,
  id,
  mock = false,
  confirmPaid = false,
  generationDisabled = false,
}: {
  store: EditorStore;
  id: string;
  mock?: boolean;
  confirmPaid?: boolean;
  generationDisabled?: boolean;
}) {
  const slot = useStore(store, (state) =>
    state.draft?.slots.find((item) => item.photo_id === id),
  );
  const loading = useStore(
    store,
    (state) => state.request.status === 'loading',
  );
  if (!slot) return null;
  const userEmpty =
    slot.caption_state === 'omitted' &&
    slot.evidence.some((item) => item.kind === 'user_text');
  return (
    <div
      className={
        slot.caption_state === 'omitted'
          ? 'border-l-2 border-omission pl-3 sm:mt-4'
          : 'sm:mt-4'
      }
    >
      <p className="text-xs font-semibold text-accent">
        {userEmpty ? '직접 비움' : labels[slot.caption_state]}
      </p>
      {slot.caption_state === 'omitted' && (
        <p className="my-3 text-sm leading-6 text-muted-foreground">
          {slot.omit_reason}
        </p>
      )}
      <label className="mt-3 block text-sm">
        {slot.position}번 사진에 내가 쓸 문장
        <textarea
          rows={3}
          value={slot.text ?? ''}
          onChange={(event) =>
            store.getState().editCaption(id, event.target.value)
          }
          placeholder="제안된 쓸 거리를 지우고 내 말로 써 보세요. 이대로 비워 두어도 괜찮아요."
          className="mt-2 w-full rounded-md border border-line bg-card p-3 text-base"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {slot.caption_state === 'omitted' ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={loading || generationDisabled}
            onClick={() => {
              if (
                confirmPaid &&
                !mock &&
                !window.confirm(
                  '문장 생성에 유료 모델 호출이 발생할 수 있어요. 계속할까요?',
                )
              )
                return;
              void store
                .getState()
                .generate(id, mock ? previewOutput : undefined);
            }}
          >
            그래도 채우기
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => store.getState().editCaption(id, '')}
          >
            말 없이 두기
          </Button>
        )}
      </div>
    </div>
  );
}
