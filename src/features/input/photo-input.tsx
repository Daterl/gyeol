'use client';

import { useEffect, useRef, useState } from 'react';
import { tv } from 'tailwind-variants';
import { useStore } from 'zustand';
import { Companion } from '../../components/companion';
import { Button } from '../../components/ui/button';
import { createEditorStore, type SelectedPhoto } from '../editor/store';
import { ResultScreen } from '../result/result-screen';
import { SamplePreview } from '../sample/sample-preview';
import {
  addFiles,
  type IdentityFields,
  MAX_SELECTED_PHOTOS,
  submitPhotos,
} from './input';
import { normalizePhotos } from './photo-normalization';
import { PhotoPicker } from './photo-picker';

const field = tv({
  base: 'mt-2 min-h-11 w-full rounded-md border border-line bg-card px-3 py-2 text-base placeholder:text-muted-foreground disabled:opacity-60',
});
export function PhotoInput({ mock = false }: { mock?: boolean }) {
  const [store] = useState(createEditorStore);
  const photos = useStore(store, (state) => state.photos);
  const original = useStore(store, (state) => state.original);
  const request = useStore(store, (state) => state.request);
  const [oldPhotos, setOldPhotos] = useState<SelectedPhoto[]>([]);
  const oldPhotosRef = useRef(oldPhotos);
  oldPhotosRef.current = oldPhotos;
  const [fields, setFields] = useState<IdentityFields>({
    currentUrl: '',
    targetText: '',
    targetUrl: '',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [normalizing, setNormalizing] = useState(false);
  const normalizingRef = useRef(false);
  const mountedRef = useRef(true);
  const identity = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (
      request.status === 'error' &&
      request.operation === 'feed' &&
      identity.current
    )
      identity.current.open = true;
  }, [request]);
  const form = useRef<HTMLFormElement>(null);
  const loading = request.status === 'loading';
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      store.getState().reset();
      for (const photo of oldPhotosRef.current) URL.revokeObjectURL(photo.url);
    };
  }, [store]);
  async function add(incoming: File[], previous = false) {
    if (normalizingRef.current) return;
    const selected = previous ? oldPhotos : photos;
    if (selected.length + incoming.length > MAX_SELECTED_PHOTOS) {
      setErrors([
        `사진은 최대 ${MAX_SELECTED_PHOTOS}장까지 추가할 수 있어요. 초과한 선택은 추가하지 않았어요.`,
      ]);
      return;
    }
    normalizingRef.current = true;
    setNormalizing(true);
    const normalized = await normalizePhotos(incoming).finally(() => {
      normalizingRef.current = false;
      if (mountedRef.current) setNormalizing(false);
    });
    if (!mountedRef.current) return;
    const result = addFiles(
      selected.map((photo) => photo.file),
      normalized.files,
    );
    setErrors([...normalized.errors, ...result.errors]);
    if (
      result.files.length === selected.length &&
      result.files.every((file, index) => file === selected[index].file)
    )
      return;
    if (previous) {
      store.getState().cancel();
      setOldPhotos(
        result.files.map(
          (file) =>
            selected.find((photo) => photo.file === file) ?? {
              file,
              photo_id: crypto.randomUUID(),
              url: URL.createObjectURL(file),
            },
        ),
      );
    } else store.getState().selectFiles(result.files);
  }
  function remove(id: string, previous = false) {
    setErrors([]);
    if (previous) {
      store.getState().cancel();
      const removed = oldPhotos.find((photo) => photo.photo_id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      setOldPhotos(oldPhotos.filter((photo) => photo.photo_id !== id));
    } else
      store
        .getState()
        .selectFiles(
          photos
            .filter((photo) => photo.photo_id !== id)
            .map((photo) => photo.file),
        );
  }
  function reset() {
    store.getState().reset();
    for (const photo of oldPhotos) URL.revokeObjectURL(photo.url);
    setOldPhotos([]);
    setFields({ currentUrl: '', targetText: '', targetUrl: '' });
    setErrors([]);
    requestAnimationFrame(() =>
      form.current
        ?.querySelector<HTMLButtonElement>(
          'button[data-photo-picker="올릴 사진"]',
        )
        ?.focus(),
    );
  }
  return (
    <>
      <div className="flex items-center justify-between gap-5 py-7 sm:py-8">
        <div>
          <p className="mb-2 font-mono text-xs tracking-widest text-accent">
            사진 여러 장, 하나의 흐름
          </p>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[32px]">
            오늘의 사진을 이어볼까요?
          </h1>
          <p className="mt-3 text-muted-foreground">
            올릴 순서를 고르고, 필요한 말만 붙여요.
          </p>
        </div>
        <Companion
          state={
            request.status === 'loading'
              ? 'working'
              : request.status === 'error'
                ? 'recovery'
                : original
                  ? 'complete'
                  : 'default'
          }
        />
      </div>
      <SamplePreview />
      <form
        ref={form}
        onInvalidCapture={() => {
          if (identity.current) identity.current.open = true;
        }}
        onSubmit={(event) => {
          event.preventDefault();
          setErrors([]);
          void store
            .getState()
            .loadFeed((signal) =>
              submitPhotos(photos, oldPhotos, fields, signal, mock),
            );
        }}
        className="space-y-6"
      >
        {mock && (
          <p className="border-l-4 border-accent bg-accent-soft px-4 py-3 text-sm">
            모델 없이 확인하는 모드예요. 선택한 사진의 픽셀만 읽고 취향이나
            문체를 추측하지 않아요.
          </p>
        )}
        <PhotoPicker
          label="올릴 사진"
          photos={photos}
          onAdd={(files) => void add(files)}
          onRemove={(id) => remove(id)}
          disabled={loading || normalizing}
        />
        {errors.length > 0 && (
          <div
            role="alert"
            className="border-l-4 border-destructive pl-4 text-sm text-destructive"
          >
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-8">
          <div>
            <p className="text-sm">
              {photos.length < 3
                ? `사진을 ${3 - photos.length}장 더 골라 주세요.`
                : `선택한 ${photos.length}장으로 시작할 수 있어요.`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              사진은 분석을 위해 서버로 전송돼요. 보정하거나 게시하지 않아요.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={photos.length < 3 || loading || normalizing}
              className="min-h-12 px-6"
            >
              {normalizing
                ? '사진을 준비하는 중…'
                : loading
                  ? request.operation === 'feed'
                    ? '사진을 살펴보는 중…'
                    : '문장 요청 중…'
                  : request.status === 'error' && request.operation === 'feed'
                    ? '다시 시도하기'
                    : '이 사진들로 시작하기'}
            </Button>
            {loading && (
              <Button
                type="button"
                variant="outline"
                onClick={() => store.getState().cancel()}
                className="min-h-12"
              >
                취소
              </Button>
            )}
          </div>
        </div>
        {request.status === 'error' && request.operation === 'feed' && (
          <p
            role="alert"
            id="request-error"
            className="border-l-4 border-destructive pl-4 text-destructive"
          >
            {request.error.message}
          </p>
        )}
        <p role="status" className="sr-only">
          {normalizing
            ? '사진의 방향과 크기를 정리하고 있어요.'
            : loading
              ? request.operation === 'feed'
                ? '사진을 분석하고 있어요. 취소할 수 있어요.'
                : '문장을 준비하고 있어요. 취소할 수 있어요.'
              : request.status === 'ready'
                ? '요청을 마쳤어요.'
                : null}
        </p>
        <details ref={identity} className="border-b border-line pb-5">
          <summary className="min-h-11 py-2 font-medium">
            조금 더 나답게 · 모두 선택
          </summary>
          <fieldset
            disabled={loading}
            className="min-w-0 space-y-6 pt-4"
            aria-describedby="identity-help"
          >
            <legend className="sr-only">개인화 선택 입력</legend>
            <p id="identity-help" className="text-sm text-muted-foreground">
              비워 두어도 시작할 수 있어요. 계정은 준비된 스냅샷만 사용하며 새로
              수집하지 않아요.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <label className="block font-medium">
                내 인스타 URL
                <input
                  type="url"
                  className={field()}
                  placeholder="https://www.instagram.com/계정/"
                  value={fields.currentUrl}
                  onChange={(event) =>
                    setFields({ ...fields, currentUrl: event.target.value })
                  }
                />
                <span className="mt-2 block text-sm font-normal text-muted-foreground">
                  기존 게시물 사진을 넣으면 이 칸은 비워 주세요.
                </span>
              </label>
              <label className="block font-medium">
                레퍼런스 인스타 URL
                <input
                  type="url"
                  className={field()}
                  placeholder="https://www.instagram.com/계정/"
                  value={fields.targetUrl}
                  onChange={(event) =>
                    setFields({ ...fields, targetUrl: event.target.value })
                  }
                />
                <span className="mt-2 block text-sm font-normal text-muted-foreground">
                  아래 원하는 느낌과 둘 중 하나만 골라 주세요.
                </span>
              </label>
            </div>
            <label className="block font-medium">
              원하는 느낌
              <textarea
                className={field()}
                rows={2}
                maxLength={2000}
                placeholder="짧고 담백하게. 이모지는 쓰지 않을래요."
                value={fields.targetText}
                onChange={(event) =>
                  setFields({ ...fields, targetText: event.target.value })
                }
              />
            </label>
            <details className="border-t border-line pt-4">
              <summary className="min-h-11 py-2 font-medium">
                내 기존 게시물 사진으로 알려주기
              </summary>
              <p className="mb-4 text-sm text-muted-foreground">
                올릴 사진과는 별도예요. 기존 사진만으로 문체를 알아내지는
                않아요.
              </p>
              <PhotoPicker
                disabled={loading || normalizing}
                label="기존 게시물 사진"
                photos={oldPhotos}
                onAdd={(files) => void add(files, true)}
                onRemove={(id) => remove(id, true)}
              />
            </details>
          </fieldset>
        </details>
        {(photos.length > 0 || oldPhotos.length > 0) && (
          <button
            type="button"
            className="min-h-11 text-sm underline underline-offset-4"
            disabled={normalizing}
            onClick={reset}
          >
            입력 초기화
          </button>
        )}
      </form>
      <ResultScreen store={store} mock={mock} />
    </>
  );
}
