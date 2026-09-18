import type { F3Export, FeedResponse } from '@/types/contracts';
import { validateEditedExport } from '../../../lib/contracts.js';
import {
  MAX_UPLOAD_BYTES,
  validateFeedResponse,
} from '../../../lib/interaction.js';
import { validateCurationState } from './curation-persistence';
import type { CurationEdits } from './curation-store';

const DATABASE_NAME = 'gyeol-editor';
const DATABASE_VERSION = 1;
const LOCAL_KEY = 'gyeol.editor.draft.v1';
const STORE_NAME = 'drafts';

export type DraftProfileReference = {
  displayName: string;
  profileImageUrl: string | null;
  username: string;
};

export type DraftMetadata = {
  curationState?: CurationEdits;
  draft: F3Export | null;
  order: string[];
  original: FeedResponse | null;
  originalOutput: F3Export | null;
  photoIds: string[];
  profileReference: DraftProfileReference | null;
  prompt: string;
};

export type RestoredDraft = DraftMetadata & {
  images: ReadonlyMap<string, Blob>;
};

type StoredMetadata = DraftMetadata & { revision: string; version: 1 };
type StoredImages = {
  images: { blob: Blob; photoId: string }[];
  revision: string;
};

type LocalStore = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
type DraftLock = <T>(task: () => Promise<T>) => Promise<T>;
export type DraftBinaryStore = {
  clear: () => Promise<void>;
  load: (revision: string) => Promise<StoredImages | null>;
  prune: (keepRevision: string) => Promise<void>;
  remove: (revision: string) => Promise<void>;
  save: (value: StoredImages) => Promise<void>;
};
export type DraftStorage = {
  clear: () => Promise<void>;
  load: () => Promise<RestoredDraft | null>;
  save: (
    metadata: DraftMetadata,
    images: ReadonlyMap<string, Blob>,
  ) => Promise<void>;
  saveMetadata: (metadata: DraftMetadata) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validateProfileReference(
  value: unknown,
): asserts value is DraftProfileReference | null {
  if (value === null) return;
  if (
    !isRecord(value) ||
    typeof value.displayName !== 'string' ||
    (value.profileImageUrl !== null &&
      (typeof value.profileImageUrl !== 'string' ||
        !value.profileImageUrl.startsWith('https://'))) ||
    typeof value.username !== 'string' ||
    !/^[\w.]{1,30}$/.test(value.username)
  )
    throw new Error('Invalid draft profile reference');
}

function validateMetadata(value: unknown): asserts value is StoredMetadata {
  if (!isRecord(value)) throw new Error('Invalid draft metadata');
  const {
    draft,
    order,
    original,
    originalOutput,
    photoIds,
    profileReference,
    prompt,
    revision,
    version,
  } = value;
  if (
    version !== 1 ||
    typeof revision !== 'string' ||
    !revision ||
    typeof prompt !== 'string' ||
    prompt.length > 2_000 ||
    !Array.isArray(photoIds) ||
    photoIds.length < 3 ||
    photoIds.length > 15 ||
    !photoIds.every((id) => typeof id === 'string' && id.length > 0) ||
    new Set(photoIds).size !== photoIds.length ||
    !Array.isArray(order) ||
    order.length !== photoIds.length ||
    !order.every((id) => typeof id === 'string' && photoIds.includes(id)) ||
    new Set(order).size !== order.length
  )
    throw new Error('Invalid draft metadata');
  validateProfileReference(profileReference);
  if (value.curationState !== undefined)
    validateCurationState(
      value.curationState,
      photoIds as string[],
      original as FeedResponse | null,
    );
  if (original !== null) {
    validateFeedResponse(original);
    const validatedOriginal = original as FeedResponse;
    const originalIds = validatedOriginal.context.photos.map(
      (photo) => photo.photo_id,
    );
    if (
      originalIds.length !== photoIds.length ||
      !photoIds.every((id) => originalIds.includes(id))
    )
      throw new Error('Draft photos differ from the saved feed');
  }
  if (draft !== null) {
    if (original === null) throw new Error('Draft output is missing its feed');
    validateEditedExport(
      draft,
      (original as FeedResponse).feed,
      photoIds as string[],
    );
  }
  if (originalOutput !== null) {
    if (original === null)
      throw new Error('Original output is missing its feed');
    validateEditedExport(
      originalOutput,
      (original as FeedResponse).feed,
      photoIds as string[],
    );
  }
}

function validateImages(
  value: StoredImages | null,
  metadata: StoredMetadata,
): asserts value is StoredImages {
  if (
    !value ||
    value.revision !== metadata.revision ||
    !Array.isArray(value.images) ||
    value.images.length !== metadata.photoIds.length
  )
    throw new Error('Draft images do not match metadata');
  const ids = new Set<string>();
  for (const image of value.images) {
    if (
      !isRecord(image) ||
      typeof image.photoId !== 'string' ||
      !metadata.photoIds.includes(image.photoId) ||
      !(image.blob instanceof Blob) ||
      image.blob.type !== 'image/webp' ||
      image.blob.size === 0 ||
      image.blob.size > MAX_UPLOAD_BYTES
    )
      throw new Error('Invalid draft image');
    ids.add(image.photoId);
  }
  if (ids.size !== metadata.photoIds.length)
    throw new Error('Duplicate draft image');
}

const storedMetadata = (
  metadata: DraftMetadata,
  revision: string,
): StoredMetadata => ({
  ...(metadata.curationState
    ? { curationState: structuredClone(metadata.curationState) }
    : {}),
  draft: structuredClone(metadata.draft),
  order: [...metadata.order],
  original: structuredClone(metadata.original),
  originalOutput: structuredClone(metadata.originalOutput),
  photoIds: [...metadata.photoIds],
  profileReference: structuredClone(metadata.profileReference),
  prompt: metadata.prompt,
  revision,
  version: 1,
});

export function createDraftStorage(
  local: LocalStore,
  binary: DraftBinaryStore,
  createRevision: () => string = () => crypto.randomUUID(),
  lock?: DraftLock,
): DraftStorage {
  let operations = Promise.resolve();
  let busy = 0;
  const run = <T>(task: () => Promise<T>) => {
    busy++;
    const operation = operations
      .catch(() => {})
      .then(() => (lock ? lock(task) : task()))
      .finally(() => {
        busy--;
      });
    operations = operation.then(
      () => {},
      () => {},
    );
    return operation;
  };
  const discard = async () => {
    await Promise.allSettled([
      binary.clear(),
      Promise.resolve().then(() => local.removeItem(LOCAL_KEY)),
    ]);
  };
  return {
    clear: () =>
      run(async () => {
        await binary.clear();
        local.removeItem(LOCAL_KEY);
      }),
    load: () =>
      run(async () => {
        // I/O failures are retryable; only proven invalid data is discarded.
        const raw = local.getItem(LOCAL_KEY);
        if (raw === null) return null;
        let metadata: StoredMetadata;
        try {
          const parsed: unknown = JSON.parse(raw);
          validateMetadata(parsed);
          metadata = parsed;
        } catch {
          await discard();
          return null;
        }
        const storedImages = await binary.load(metadata.revision);
        try {
          validateImages(storedImages, metadata);
        } catch {
          await discard();
          return null;
        }
        if (lock) await Promise.allSettled([binary.prune(metadata.revision)]);
        return {
          ...(metadata.curationState
            ? { curationState: structuredClone(metadata.curationState) }
            : {}),
          draft: structuredClone(metadata.draft),
          images: new Map(
            storedImages.images.map(({ blob, photoId }) => [photoId, blob]),
          ),
          order: [...metadata.order],
          original: structuredClone(metadata.original),
          originalOutput: structuredClone(metadata.originalOutput),
          photoIds: [...metadata.photoIds],
          profileReference: structuredClone(metadata.profileReference),
          prompt: metadata.prompt,
        };
      }),
    save: (metadata, images) =>
      run(async () => {
        const revision = createRevision();
        const value = storedMetadata(metadata, revision);
        validateMetadata(value);
        const storedImages: StoredImages = {
          images: value.photoIds.map((photoId) => {
            const blob = images.get(photoId);
            if (!blob) throw new Error(`Missing WebP for ${photoId}`);
            return { blob, photoId };
          }),
          revision,
        };
        validateImages(storedImages, value);
        const previousRaw = local.getItem(LOCAL_KEY);
        let previousRevision: string | null = null;
        if (previousRaw !== null)
          try {
            const previous: unknown = JSON.parse(previousRaw);
            validateMetadata(previous);
            previousRevision = previous.revision;
          } catch {}
        try {
          await binary.save(storedImages);
          local.setItem(LOCAL_KEY, JSON.stringify(value));
        } catch (error) {
          await Promise.allSettled([binary.remove(revision)]);
          throw error;
        }
        if (previousRevision && previousRevision !== revision)
          await Promise.allSettled([binary.remove(previousRevision)]);
      }),
    saveMetadata: (metadata) => {
      if (busy) throw new Error('Draft storage is busy');
      const raw = local.getItem(LOCAL_KEY);
      if (raw === null) throw new Error('Draft images are not saved');
      const current: unknown = JSON.parse(raw);
      validateMetadata(current);
      if (
        current.photoIds.length !== metadata.photoIds.length ||
        !current.photoIds.every((id) => metadata.photoIds.includes(id))
      )
        throw new Error('Draft photos changed');
      const value = storedMetadata(metadata, current.revision);
      validateMetadata(value);
      local.setItem(LOCAL_KEY, JSON.stringify(value));
    },
  };
}

export function createIndexedDbBinaryStore(
  factory: IDBFactory,
): DraftBinaryStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME))
          request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
    });
  const run = async <T>(
    mode: IDBTransactionMode,
    task: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const database = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const request = task(transaction.objectStore(STORE_NAME));
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  };
  return {
    clear: async () => {
      await run('readwrite', (store) => store.clear());
    },
    load: (revision) =>
      run<StoredImages | null>('readonly', (store) => store.get(revision)),
    prune: async (keepRevision) => {
      const database = await open();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, 'readwrite');
          const request = transaction.objectStore(STORE_NAME).openKeyCursor();
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            if (cursor.key !== keepRevision) cursor.delete();
            cursor.continue();
          };
          request.onerror = () => reject(request.error);
          transaction.onabort = () => reject(transaction.error);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
      } finally {
        database.close();
      }
    },
    remove: async (revision) => {
      await run('readwrite', (store) => store.delete(revision));
    },
    save: async (value) => {
      await run('readwrite', (store) => store.put(value, value.revision));
    },
  };
}

let browserDraftStorage: DraftStorage | null | undefined;
export function createBrowserDraftStorage(): DraftStorage | null {
  if (browserDraftStorage !== undefined) return browserDraftStorage;
  try {
    if (typeof localStorage === 'undefined' || typeof indexedDB === 'undefined')
      return null;
    browserDraftStorage = createDraftStorage(
      localStorage,
      createIndexedDbBinaryStore(indexedDB),
      () => crypto.randomUUID(),
      typeof navigator !== 'undefined' && navigator.locks
        ? <T>(task: () => Promise<T>) =>
            navigator.locks.request('gyeol-editor-draft', task)
        : undefined,
    );
    return browserDraftStorage;
  } catch {
    browserDraftStorage = null;
    return null;
  }
}
