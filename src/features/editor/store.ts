import { createStore } from 'zustand/vanilla';
import type {
  F3Export,
  FeedResponse,
  GenerateRequest,
} from '@/types/contracts';
import { validateEditedExport } from '../../../lib/contracts.js';
import {
  validateFeedResponse,
  validateGenerateResponse,
} from '../../../lib/interaction.js';
import { ApiError, generateOutput } from '../../lib/api';
import {
  createBrowserDraftStorage,
  type DraftMetadata,
  type DraftProfileReference,
  type DraftStorage,
} from './draft-storage';

export type SelectedPhoto = { file: File; photo_id: string; url: string };
type RequestState =
  | { status: 'idle' | 'ready' }
  | { operation: 'feed' | 'all' | 'slot'; photo_id?: string; status: 'loading' }
  | { error: ApiError; operation: 'feed' | 'all' | 'slot'; status: 'error' };
type EditorState = {
  draft: F3Export | null;
  order: string[];
  original: FeedResponse | null;
  originalOutput: F3Export | null;
  photos: SelectedPhoto[];
  profileReference: DraftProfileReference | null;
  prompt: string;
  request: RequestState;
};
type EditorActions = {
  cancel: () => void;
  clearDraft: () => Promise<void>;
  editCaption: (id: string, text: string) => void;
  editTitle: (title: string) => void;
  exportDraft: () => F3Export;
  generate: (id?: string, run?: typeof generateOutput) => Promise<void>;
  loadFeed: (
    task: (signal: AbortSignal) => Promise<FeedResponse>,
  ) => Promise<void>;
  movePhoto: (id: string, destination: number) => void;
  persistDraft: (images: ReadonlyMap<string, Blob>) => Promise<void>;
  reset: () => void;
  restoreDraft: () => Promise<boolean>;
  selectFiles: (files: File[]) => void;
  setProfileReference: (reference: DraftProfileReference | null) => void;
  setPrompt: (prompt: string) => void;
};
const initialState: EditorState = {
  draft: null,
  order: [],
  original: null,
  originalOutput: null,
  photos: [],
  profileReference: null,
  prompt: '',
  request: { status: 'idle' },
};
const arrange = (output: F3Export, order: string[]): F3Export => ({
  ...output,
  slots: order.map((id, index) => {
    const slot = output.slots.find((item) => item.photo_id === id);
    if (!slot) throw new Error('Missing caption photo');
    return { ...slot, position: index + 1 };
  }),
});

// Instantiate inside the editor Client Component, never as a server/module singleton.
export function createEditorStore(
  persistence: DraftStorage | null = createBrowserDraftStorage(),
  extension?: {
    save: () => Pick<DraftMetadata, 'curationState'>;
    restore: (metadata: DraftMetadata) => void;
  },
) {
  let active: AbortController | null = null;
  let persistenceQueue = Promise.resolve();
  let persistedPhotoKey = '';
  let restoreEpoch = 0;
  return createStore<EditorState & EditorActions>((set, get) => {
    const enqueuePersistence = (task: () => Promise<void>) => {
      const pending = persistenceQueue.catch(() => {}).then(task);
      persistenceQueue = pending;
      return pending;
    };
    const stop = () => {
      active?.abort();
      active = null;
    };
    const begin = (request: RequestState) => {
      stop();
      const controller = new AbortController();
      active = controller;
      set({ request });
      return controller;
    };
    const fail = (error: unknown, controller: AbortController) => {
      if (active !== controller) return;
      const request = get().request;
      if (request.status !== 'loading') return;
      active = null;
      set({
        request: {
          operation: request.operation,
          error:
            error instanceof ApiError
              ? error
              : new ApiError(
                  'INVALID_RESULT',
                  '결과를 확인하지 못했어요. 다시 시도해 주세요.',
                  0,
                  true,
                ),
          status: 'error',
        },
      });
    };
    const resetState = (invalidateRestore = true) => {
      if (invalidateRestore) restoreEpoch++;
      stop();
      for (const photo of get().photos) URL.revokeObjectURL(photo.url);
      set({ ...initialState });
    };
    const metadata = (state: EditorState): DraftMetadata => ({
      ...extension?.save(),
      draft: state.draft,
      order: state.order,
      original: state.original,
      originalOutput: state.originalOutput,
      photoIds: state.photos.map((photo) => photo.photo_id),
      profileReference: state.profileReference,
      prompt: state.prompt,
    });
    return {
      ...initialState,
      cancel: () => {
        stop();
        set({ request: { status: get().original ? 'ready' : 'idle' } });
      },
      clearDraft: async () => {
        persistedPhotoKey = '';
        resetState();
        if (persistence)
          await enqueuePersistence(async () => {
            await persistence.clear();
            persistedPhotoKey = '';
          });
      },
      editCaption: (id, text) => {
        const draft = get().draft;
        if (!draft) return;
        set({
          draft: {
            ...draft,
            slots: draft.slots.map((slot) => {
              if (slot.photo_id !== id) return slot;
              const evidence = [
                ...slot.evidence.filter((item) => item.kind !== 'user_text'),
                {
                  kind: 'user_text' as const,
                  note: text.trim()
                    ? '사용자가 직접 쓴 문장'
                    : '사용자가 설명을 비움',
                  ref: id,
                },
              ];
              return text.trim()
                ? {
                    ...slot,
                    caption_state: 'user',
                    evidence,
                    omit_reason: null,
                    text,
                  }
                : {
                    ...slot,
                    caption_state: 'omitted',
                    evidence,
                    omit_reason: '직접 비워 두었어요.',
                    text: null,
                  };
            }),
          },
        });
      },
      editTitle: (title) => {
        const draft = get().draft;
        if (draft) set({ draft: { ...draft, title } });
      },
      exportDraft: () => {
        const { draft, original } = get();
        if (!draft || !original)
          throw new ApiError('NO_OUTPUT', '내보낼 초안이 아직 없어요.');
        validateEditedExport(
          draft,
          original.feed,
          original.context.photos.map((photo) => photo.photo_id),
        );
        return structuredClone(draft);
      },
      generate: async (id, run = generateOutput) => {
        const { original, originalOutput, draft: before } = get();
        if (!original || (id && !before)) return;
        const controller = begin({
          operation: id ? 'slot' : 'all',
          photo_id: id,
          status: 'loading',
        });
        try {
          const input: GenerateRequest = {
            ...original,
            schema_version: '1.0',
            ...(id ? { mode: 'slot', photo_id: id } : { mode: 'all' }),
          };
          const result = await run(input, controller.signal);
          if (active !== controller) return;
          validateGenerateResponse(result, input);
          const { draft: current, order } = get();
          if ('output' in result) {
            const output = structuredClone(result.output);
            const slots = output.slots.map((slot) => {
              const edited = current?.slots.find(
                (item) => item.photo_id === slot.photo_id,
              );
              const previous = before?.slots.find(
                (item) => item.photo_id === slot.photo_id,
              );
              return edited &&
                (edited.evidence.some((item) => item.kind === 'user_text') ||
                  edited.text !== previous?.text ||
                  edited.omit_reason !== previous?.omit_reason ||
                  edited.evidence !== previous?.evidence)
                ? edited
                : slot;
            });
            set({
              originalOutput: output,
              draft: arrange(
                {
                  slots,
                  title:
                    current &&
                    (current.title !== before?.title ||
                      current.title !== originalOutput?.title)
                      ? current.title
                      : output.title,
                },
                order,
              ),
            });
          } else if (current) {
            const slot = result.slot;
            const previous = before?.slots.find(
              (item) => item.photo_id === slot.photo_id,
            );
            set({
              draft: arrange(
                {
                  ...current,
                  slots: current.slots.map((item) =>
                    item.photo_id === slot.photo_id &&
                    item.text === previous?.text &&
                    item.omit_reason === previous?.omit_reason &&
                    item.evidence === previous?.evidence
                      ? structuredClone(slot)
                      : item,
                  ),
                },
                order,
              ),
            });
          }
          active = null;
          set({ request: { status: 'ready' } });
        } catch (error) {
          fail(error, controller);
        }
      },
      loadFeed: async (task) => {
        const controller = begin({ operation: 'feed', status: 'loading' });
        try {
          const response = await task(controller.signal);
          if (active !== controller) return;
          validateFeedResponse(response);
          const ids = response.context.photos.map((photo) => photo.photo_id);
          const selected = get().photos;
          if (
            selected.length &&
            (ids.length !== selected.length ||
              ids.some(
                (id) => !selected.some((photo) => photo.photo_id === id),
              ))
          )
            throw new Error('Selected photos differ');
          const original = structuredClone(response);
          const order = original.feed.slots
            .toSorted((a, b) => a.position - b.position)
            .map((slot) => slot.photo_id);
          // New feed means a new original; keep existing edits only for the same photo set.
          const current = get().draft;
          const draft =
            current &&
            current.slots.length === ids.length &&
            current.slots.every((slot) => ids.includes(slot.photo_id))
              ? arrange(current, order)
              : null;
          active = null;
          set({
            draft,
            order,
            original,
            originalOutput: null,
            request: { status: 'ready' },
          });
        } catch (error) {
          fail(error, controller);
        }
      },
      movePhoto: (id, destination) => {
        const { order, draft } = get();
        const from = order.indexOf(id);
        if (
          from < 0 ||
          !Number.isInteger(destination) ||
          destination < 0 ||
          destination >= order.length
        )
          return;
        const next = [...order];
        next.splice(from, 1);
        next.splice(destination, 0, id);
        set({ order: next, draft: draft ? arrange(draft, next) : null });
      },
      persistDraft: async (images) => {
        if (!persistence) return;
        const state = get();
        if (state.photos.length < 3) {
          // Decide after earlier saves finish, including the first binary save.
          return enqueuePersistence(async () => {
            if (!persistedPhotoKey) return;
            await persistence.clear();
            persistedPhotoKey = '';
          });
        }
        const value = metadata(state);
        const photoKey = JSON.stringify(value.photoIds);
        if (photoKey === persistedPhotoKey) {
          try {
            persistence.saveMetadata(value);
            return;
          } catch {
            persistedPhotoKey = '';
          }
        }
        await enqueuePersistence(async () => {
          if (photoKey === persistedPhotoKey) {
            persistence.saveMetadata(value);
            return;
          }
          await persistence.save(value, images);
          persistedPhotoKey = photoKey;
        });
      },
      reset: resetState,
      restoreDraft: async () => {
        if (!persistence) return false;
        const epoch = ++restoreEpoch;
        const restored = await persistence.load();
        if (!restored || epoch !== restoreEpoch) return false;
        const photos: SelectedPhoto[] = [];
        try {
          for (const photoId of restored.photoIds) {
            const blob = restored.images.get(photoId);
            if (!blob) throw new Error(`Missing restored WebP for ${photoId}`);
            const file = new File([blob], `${photoId}.webp`, {
              type: 'image/webp',
            });
            photos.push({
              file,
              photo_id: photoId,
              url: URL.createObjectURL(file),
            });
          }
        } catch {
          for (const photo of photos) URL.revokeObjectURL(photo.url);
          await persistence.clear();
          return false;
        }
        resetState(false);
        set({
          draft: restored.draft,
          order: restored.order,
          original: restored.original,
          originalOutput: restored.originalOutput,
          photos,
          profileReference: restored.profileReference,
          prompt: restored.prompt,
          request: { status: restored.original ? 'ready' : 'idle' },
        });
        extension?.restore(restored);
        persistedPhotoKey = JSON.stringify(restored.photoIds);
        return true;
      },
      selectFiles: (files) => {
        if (files.length > 15 || new Set(files).size !== files.length)
          throw new ApiError(
            'INVALID_SELECTION',
            '서로 다른 사진을 최대 15장 선택해 주세요.',
          );
        restoreEpoch++;
        const { photos: previous, profileReference, prompt } = get();
        const photos = files.map(
          (file) =>
            previous.find((photo) => photo.file === file) ?? {
              file,
              photo_id: crypto.randomUUID(),
              url: URL.createObjectURL(file),
            },
        );
        stop();
        for (const photo of previous)
          if (!photos.includes(photo)) URL.revokeObjectURL(photo.url);
        set({
          ...initialState,
          order: photos.map((photo) => photo.photo_id),
          photos,
          profileReference,
          prompt,
        });
      },
      setProfileReference: (profileReference) => {
        restoreEpoch++;
        set({ profileReference });
      },
      setPrompt: (prompt) => {
        restoreEpoch++;
        set({ prompt });
      },
    };
  });
}
export type EditorStore = ReturnType<typeof createEditorStore>;
