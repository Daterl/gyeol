'use client';

import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { Companion } from '@/components/companion';
import { Button } from '@/components/ui/button';
import { previewOutput } from '../captions/preview-output';
import {
  canRegenerateCuration,
  createCurationEditorStore,
} from '../editor/curation-store';
import { CurationPreview } from '../result/curation-preview';
import { SamplePreview } from '../sample/sample-preview';
import { addFiles, MAX_SELECTED_PHOTOS, submitCuration } from './input';
import { normalizePhotos } from './photo-normalization';
import { PhotoPicker } from './photo-picker';
import { type ConnectedProfile, ProfileConnection } from './profile-connection';

export function PhotoInput({ mock = false }: { mock?: boolean }) {
  const [store] = useState(createCurationEditorStore);
  const original = useStore(store, (state) => state.original);
  const photos = useStore(store, (state) => state.photos);
  const request = useStore(store, (state) => state.request);
  const [profile, setProfile] = useState<ConnectedProfile | null>(null);
  const prompt = useStore(store, (state) => state.prompt);
  const curation = useStore(store, (state) => state.curation);
  const [draftReady, setDraftReady] = useState(false);
  const [restoredUrl, setRestoredUrl] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [normalizing, setNormalizing] = useState(false);
  const normalizingRef = useRef(false);
  const mountedRef = useRef(true);
  const generation = useRef(0);
  const loading = request.status === 'loading';
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    mountedRef.current = true;
    void store
      .getState()
      .restoreDraft()
      .then(() => {
        if (!active) return;
        const reference = store.getState().profileReference;
        if (reference)
          setRestoredUrl(`https://www.instagram.com/${reference.username}/`);
      })
      .catch(() => {
        if (active) setErrors(['저장된 초안을 불러오지 못했어요.']);
      })
      .finally(() => {
        if (!active) return;
        setDraftReady(true);
        const persist = () => {
          const state = store.getState();
          void state
            .persistDraft(
              new Map(
                state.photos.map((photo) => [photo.photo_id, photo.file]),
              ),
            )
            .catch(() => {
              if (mountedRef.current)
                setErrors(['이 기기에서 초안을 저장하지 못했어요.']);
            });
        };
        unsubscribe = store.subscribe(persist);
      });
    return () => {
      active = false;
      unsubscribe();
      mountedRef.current = false;
      generation.current++;
      store.getState().reset();
    };
  }, [store]);
  async function add(incoming: File[]) {
    if (!draftReady || normalizingRef.current || !profile) return;
    if (photos.length + incoming.length > MAX_SELECTED_PHOTOS) {
      setErrors([
        `사진은 최대 ${MAX_SELECTED_PHOTOS}장까지 추가할 수 있어요. 초과한 선택은 추가하지 않았어요.`,
      ]);
      return;
    }
    const current = generation.current;
    normalizingRef.current = true;
    setNormalizing(true);
    try {
      const normalized = await normalizePhotos(incoming);
      if (!mountedRef.current || generation.current !== current) return;
      const result = addFiles(
        photos.map((photo) => photo.file),
        normalized.files,
      );
      setErrors([...normalized.errors, ...result.errors]);
      if (
        result.files.length === photos.length &&
        result.files.every((file, index) => file === photos[index].file)
      )
        return;
      store.getState().selectFiles(result.files);
      setConfirmed(false);
    } finally {
      normalizingRef.current = false;
      if (mountedRef.current) setNormalizing(false);
    }
  }
  function reset() {
    generation.current++;
    void store
      .getState()
      .clearDraft()
      .catch(() => setErrors(['저장된 초안을 지우지 못했어요.']));
    setConfirmed(false);
    setErrors([]);
  }
  return (
    <div className="mx-auto w-full max-w-6xl [&_button]:min-h-11">
      <div className="flex items-center justify-between gap-6 py-8 sm:py-12">
        <div className="max-w-2xl">
          <p className="mb-2 font-mono text-xs tracking-widest text-accent">
            사진 여러 장, 하나의 흐름
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            오늘의 사진을 이어볼까요?
          </h1>
          <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
            공개 프로필의 분위기를 참고해 3~15장의 순서와 문장을 제안해요.
            확정하기 전까지 직접 고칠 수 있어요.
          </p>
        </div>
        <Companion
          state={
            loading
              ? 'working'
              : request.status === 'error'
                ? 'recovery'
                : original
                  ? 'complete'
                  : 'default'
          }
        />
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            !draftReady ||
            !profile ||
            loading ||
            normalizing ||
            errors.length ||
            (!mock && !confirmed)
          )
            return;
          setConfirmed(false);
          const loaded = await store
            .getState()
            .loadCuration((signal) =>
              submitCuration(photos, profile, prompt, signal, mock),
            );
          if (loaded)
            await store
              .getState()
              .generate(undefined, mock ? previewOutput : undefined);
        }}
      >
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] lg:gap-12">
          {profile ? (
            <fieldset
              disabled={!draftReady || loading || normalizing}
              className="min-w-0 rounded-xl border border-line bg-card p-5 sm:p-6"
            >
              <legend className="mb-4 font-semibold">2. 사진 고르기</legend>
              <PhotoPicker
                label="올릴 사진"
                photos={photos}
                disabled={!draftReady || loading || normalizing}
                onAdd={(files) => void add(files)}
                onRemove={(id) => {
                  store
                    .getState()
                    .selectFiles(
                      photos
                        .filter((photo) => photo.photo_id !== id)
                        .map((photo) => photo.file),
                    );
                  setConfirmed(false);
                }}
              />
              <p className="mt-3 text-sm text-muted-foreground">
                3~15장 · 긴 변 최대 1440px WebP로 준비하며 EXIF·GPS를 제거해요.
              </p>
            </fieldset>
          ) : (
            <SamplePreview />
          )}
          <div className="order-first space-y-6 rounded-xl border border-line bg-card p-5 sm:p-6 lg:order-none lg:sticky lg:top-6">
            <ProfileConnection
              initialUrl={restoredUrl}
              disabled={!draftReady || loading || normalizing}
              onChange={(value) => {
                generation.current++;
                setProfile(value);
                if (value) {
                  const username = new URL(value.url).pathname
                    .split('/')
                    .filter(Boolean)[0];
                  store.getState().setProfileReference({
                    username,
                    displayName: username,
                    profileImageUrl: null,
                  });
                }
                setConfirmed(false);
                store.getState().cancel();
              }}
            />
            {mock && (
              <p className="text-sm text-muted-foreground">
                사진·문장 예시 모드예요. 공개 프로필 연결은 별도이며 실수집
                비용이 발생할 수 있어요.
              </p>
            )}
            {profile && (
              <fieldset
                disabled={!draftReady || loading || normalizing}
                className="min-w-0 space-y-5 border-t border-line pt-6"
              >
                <legend className="mb-3 font-semibold">
                  원하는 느낌 (선택)
                </legend>
                <textarea
                  aria-label="원하는 느낌"
                  rows={4}
                  maxLength={2000}
                  value={prompt}
                  onChange={(event) => {
                    store.getState().setPrompt(event.target.value);
                    setConfirmed(false);
                  }}
                  placeholder="비워 두면 연결한 공개 프로필의 수집 가능한 스타일을 참고해요."
                  className="w-full rounded-md border border-line p-3 text-base"
                />
                {!mock && (
                  <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                      className="mt-1 size-5 shrink-0"
                    />
                    사진 분석·문장 생성에 유료 모델 호출이 발생할 수 있음을
                    확인하고 시작할게요.
                  </label>
                )}
              </fieldset>
            )}
            {errors.length > 0 && (
              <div
                role="alert"
                className="space-y-2 border-l-4 border-destructive pl-3 text-sm"
              >
                {errors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
                <p>
                  빠진 사진을 확인한 뒤 남은 선택으로 계속하거나 다시 추가해
                  주세요.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={normalizing}
                  onClick={() => setErrors([])}
                >
                  누락 안내 확인
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                className={profile ? undefined : 'hidden'}
                disabled={
                  !draftReady ||
                  !profile ||
                  photos.length < 3 ||
                  photos.length > MAX_SELECTED_PHOTOS ||
                  loading ||
                  normalizing ||
                  errors.length > 0 ||
                  (!mock && !confirmed)
                }
              >
                {normalizing
                  ? '사진 준비 중…'
                  : loading
                    ? '큐레이션 준비 중…'
                    : request.status === 'error' && request.operation === 'feed'
                      ? '다시 시도하기'
                      : '큐레이션 만들기'}
              </Button>
              {loading && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => store.getState().cancel()}
                >
                  취소
                </Button>
              )}
            </div>
            {request.status === 'error' && (
              <p role="alert" className="text-sm text-destructive">
                {request.error.message}
              </p>
            )}
            <p role="status" className="text-sm">
              {normalizing
                ? '사진을 준비하고 있어요.'
                : loading
                  ? '사진과 문장을 준비하고 있어요. 취소할 수 있어요.'
                  : profile
                    ? `${photos.length}장 선택`
                    : '공개 프로필을 연결하면 사진을 고를 수 있어요.'}
            </p>
            {photos.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                disabled={normalizing}
                onClick={reset}
              >
                사진·편집 초기화
              </Button>
            )}
          </div>
        </div>
      </form>
      <CurationPreview
        store={store}
        mock={mock}
        canGenerate={canRegenerateCuration(curation, profile)}
        generationNotice={
          profile
            ? '연결한 프로필 또는 수집본이 달라졌어요. 사진·편집·이전 확정본은 보존돼요. 이 연결로 큐레이션을 새로 만든 뒤 문장을 제안받아 주세요.'
            : undefined
        }
      />
    </div>
  );
}
