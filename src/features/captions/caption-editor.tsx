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
}: {
  store: EditorStore;
  mock?: boolean;
}) {
  const draft = useStore(store, (state) => state.draft);
  const request = useStore(store, (state) => state.request);
  const [notice, setNotice] = useState('');
  const loading = request.status === 'loading';
  return (
    <div className="my-8 space-y-4 border-y border-line py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">
            말을 붙여도, 비워도 괜찮아요.
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            사진마다 필요한 말만 제안해요. 직접 쓴 문장은 다시 요청해도 남겨
            둡니다.
          </p>
        </div>
        <Button
          type="button"
          className="min-h-11"
          disabled={loading}
          onClick={() =>
            void store
              .getState()
              .generate(undefined, mock ? previewOutput : undefined)
          }
        >
          {loading
            ? '문장을 살펴보는 중…'
            : draft
              ? '문장 다시 제안받기'
              : '제목과 문장 제안받기'}
        </Button>
      </div>
      {mock && (
        <p className="text-sm text-muted-foreground">
          모델 없이 확인하는 예시예요. 선택한 사진의 관찰을 그대로 옮기고 일부를
          비워 둡니다. 문장 품질 평가용 결과는 아니에요.
        </p>
      )}
      {loading && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => store.getState().cancel()}
        >
          문장 요청 취소
        </Button>
      )}
      {request.status === 'error' && (
        <p role="alert" className="text-destructive">
          {request.error.message}
        </p>
      )}
      {draft && (
        <>
          <label className="block text-sm font-medium">
            기록의 제목
            <input
              value={draft.title}
              onChange={(event) =>
                store.getState().editTitle(event.target.value)
              }
              className="mt-2 min-h-11 w-full rounded-md border border-line bg-card px-3 py-2 text-base"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {(['json', 'txt'] as const).map((format) => (
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
          </div>
          {!draft.title.trim() && (
            <p className="text-sm">내보낼 기록에 제목을 붙여 주세요.</p>
          )}
          <p role="status" className="text-sm">
            {notice}
          </p>
        </>
      )}
    </div>
  );
}

export function CaptionEditor({
  store,
  id,
  mock = false,
}: {
  store: EditorStore;
  id: string;
  mock?: boolean;
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
    <div className="mt-5 border-t border-line-soft pt-4">
      <p className="text-xs font-semibold text-accent">
        {userEmpty ? '직접 비움' : labels[slot.caption_state]}
      </p>
      {slot.caption_state === 'omitted' && (
        <p className="my-3 text-sm leading-6 text-muted-foreground">
          {slot.omit_reason}
        </p>
      )}
      <label className="mt-3 block text-sm">
        {slot.position}번 사진의 문장
        <textarea
          rows={3}
          value={slot.text ?? ''}
          onChange={(event) =>
            store.getState().editCaption(id, event.target.value)
          }
          placeholder="이대로 비워 두어도 괜찮아요."
          className="mt-2 w-full rounded-md border border-line bg-card p-3 text-base"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {slot.caption_state === 'omitted' ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={loading}
            onClick={() =>
              void store
                .getState()
                .generate(id, mock ? previewOutput : undefined)
            }
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
