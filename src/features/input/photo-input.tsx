'use client';

import { useEffect, useRef, useState } from 'react';
import { tv } from 'tailwind-variants';
import { useStore } from 'zustand';
import { Button } from '../../components/ui/button';
import { createEditorStore, type SelectedPhoto } from '../editor/store';
import { SamplePreview } from '../sample/sample-preview';
import { addFiles, type IdentityFields, submitPhotos } from './input';
import { PhotoPicker } from './photo-picker';

const field = tv({
  base: 'mt-2 min-h-11 w-full rounded-md border border-line bg-card px-3 py-2 text-base placeholder:text-muted-foreground disabled:opacity-60',
});
export function PhotoInput({ mock = false }: { mock?: boolean }) {
  const [store] = useState(createEditorStore);
  const photos = useStore(store, (state) => state.photos);
  const request = useStore(store, (state) => state.request);
  const original = useStore(store, (state) => state.original);
  const [oldPhotos, setOldPhotos] = useState<SelectedPhoto[]>([]);
  const oldPhotosRef = useRef(oldPhotos);
  oldPhotosRef.current = oldPhotos;
  const [fields, setFields] = useState<IdentityFields>({
    currentUrl: '',
    targetText: '',
    targetUrl: '',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const loading = request.status === 'loading';
  useEffect(
    () => () => {
      store.getState().reset();
      for (const photo of oldPhotosRef.current) URL.revokeObjectURL(photo.url);
    },
    [store],
  );
  useEffect(() => {
    if (original) resultHeading.current?.focus();
  }, [original]);
  function add(incoming: File[], previous = false) {
    const selected = previous ? oldPhotos : photos;
    const result = addFiles(
      selected.map((photo) => photo.file),
      incoming,
    );
    setErrors(result.errors);
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
      <form
        ref={form}
        onSubmit={(event) => {
          event.preventDefault();
          setErrors([]);
          void store
            .getState()
            .loadFeed((signal) =>
              submitPhotos(photos, oldPhotos, fields, signal, mock),
            );
        }}
        className="space-y-8"
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
          onAdd={(files) => add(files)}
          onRemove={(id) => remove(id)}
          disabled={loading}
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
              disabled={photos.length < 3 || loading}
              className="min-h-12 px-6"
            >
              {loading
                ? '사진을 살펴보는 중…'
                : request.status === 'error'
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
        {request.status === 'error' && (
          <p
            role="alert"
            id="request-error"
            className="border-l-4 border-destructive pl-4 text-destructive"
          >
            {request.error.message}
          </p>
        )}
        <p role="status" className="sr-only">
          {loading
            ? '사진을 분석하고 있어요. 취소할 수 있어요.'
            : request.status === 'ready'
              ? '사진을 확인했어요.'
              : null}
        </p>
        <fieldset
          disabled={loading}
          className="min-w-0 space-y-6"
          aria-describedby="identity-help"
        >
          <legend className="text-xl font-semibold">
            조금 더 나답게{' '}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              모두 선택
            </span>
          </legend>
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
              올릴 사진과는 별도예요. 기존 사진만으로 문체를 알아내지는 않아요.
            </p>
            <PhotoPicker
              disabled={loading}
              label="기존 게시물 사진"
              photos={oldPhotos}
              onAdd={(files) => add(files, true)}
              onRemove={(id) => remove(id, true)}
            />
          </details>
        </fieldset>
        {(photos.length > 0 || oldPhotos.length > 0) && (
          <button
            type="button"
            className="min-h-11 text-sm underline underline-offset-4"
            onClick={reset}
          >
            입력 초기화
          </button>
        )}
      </form>
      {original && (
        <section
          className="my-10 border-y border-line py-8"
          aria-labelledby="input-result"
        >
          <h2
            ref={resultHeading}
            tabIndex={-1}
            id="input-result"
            className="text-2xl font-semibold"
          >
            사진 {original.feed.slots.length}장을 확인했어요.
          </h2>
          <p className="mt-3">
            {'kind' in original.context.target
              ? '개인화 정보 없이 사진을 바탕으로 준비했어요.'
              : '입력한 지향과 사진을 함께 확인했어요.'}
          </p>
          <ol className="mt-5 space-y-3">
            {original.feed.slots.map((slot) => (
              <li key={slot.photo_id}>
                <span className="mr-3 font-mono">
                  {String(slot.position).padStart(2, '0')}
                </span>
                {slot.rationale.value}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm text-muted-foreground">
            사진의 픽셀과 입력한 정보만 확인했어요.
          </p>
        </section>
      )}
      <div className="mt-12">
        <SamplePreview />
      </div>
    </>
  );
}
